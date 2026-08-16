import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { comparisonRate, dashboardCvr, dashboardDateKey, dashboardPeriodStart, dashboardRange } from "../src/callable/getAdminDashboard";

const root = path.resolve(__dirname, "../../..");
const callable = readFileSync(path.resolve(root, "functions/src/callable/getAdminDashboard.ts"), "utf8");
const admin = readFileSync(path.resolve(root, "pages/admin.html"), "utf8");
const analytics = readFileSync(path.resolve(root, "analytics.js"), "utf8");
const conversions = readFileSync(path.resolve(root, "functions/src/analytics/recordAnalyticsEvent.ts"), "utf8");

test("dashboard periods use Tokyo dates at the UTC boundary", () => {
  const beforeMidnight = new Date("2026-08-15T14:59:59.999Z");
  const midnight = new Date("2026-08-15T15:00:00.000Z");
  assert.equal(dashboardDateKey(beforeMidnight), "2026-08-15");
  assert.equal(dashboardDateKey(midnight), "2026-08-16");
  assert.equal(dashboardPeriodStart("today", midnight), "2026-08-16");
  assert.equal(dashboardPeriodStart("7d", midnight), "2026-08-10");
  assert.equal(dashboardPeriodStart("30d", midnight), "2026-07-18");
  assert.equal(dashboardPeriodStart("total", midnight), undefined);
});

test("month, previous month and custom periods use inclusive JST ranges", () => {
  const now = new Date("2026-08-15T15:00:00.000Z");
  assert.deepEqual(dashboardRange("month", now), { start: "2026-08-01", end: "2026-08-16", comparisonStart: "2026-07-01", comparisonEnd: "2026-07-16" });
  assert.deepEqual(dashboardRange("previous_month", now), { start: "2026-07-01", end: "2026-07-31", comparisonStart: null, comparisonEnd: null });
  assert.deepEqual(dashboardRange("custom", now, "2026-07-18", "2026-07-26"), { start: "2026-07-18", end: "2026-07-26", comparisonStart: "2026-07-09", comparisonEnd: "2026-07-17" });
  assert.equal(comparisonRate(118.4, 100), 18.400000000000006);
  assert.equal(comparisonRate(10, 0), null);
});

test("CVR is returned only when UU covers the complete selected period", () => {
  assert.deepEqual(dashboardCvr(15, 18, false), { eligible: false, value: null });
  assert.deepEqual(dashboardCvr(3, 12, true), { eligible: true, value: 25 });
  assert.deepEqual(dashboardCvr(0, 0, true), { eligible: false, value: null });
});

test("dashboard authenticates before server-side source aggregation", () => {
  const handler = callable.slice(callable.indexOf("export const getAdminDashboard"));
  assert.ok(handler.indexOf("await assertActiveAdmin") < handler.indexOf("Promise.all"));
  for (const collection of ["users", "applications", "jobEntries", "storeApplications", "jobViewStats", "storeViewStats", "analyticsDaily", "adDailyStats"]) assert.match(callable, new RegExp(`\\"${collection}\\"`));
  assert.match(callable, /doc\.get\("role"\) === "user"/);
  assert.match(callable, /applicationKey/);
  assert.doesNotMatch(callable, /count\("jobApplications"/);
});

test("dashboard aggregates expanded CV, reservations and rankings from source documents", () => {
  for (const collection of ["storeReviews", "storeReservations", "storeCustomerDaily", "analyticsVisitorDays", "analyticsTrafficDaily", "storeContracts", "casts"]) assert.match(callable, new RegExp(collection));
  for (const field of ["reviews", "reservations", "aiCompletes", "benefitEligible", "sourceLabel", "reservation_form_view"]) assert.match(callable, new RegExp(field));
  assert.match(callable, /jobRanking/);
  assert.match(callable, /storeRanking/);
  assert.match(admin, /人気求人ランキング/);
  assert.match(admin, /店舗・予約ランキング/);
  assert.match(admin, /カスタム期間/);
  assert.match(admin, /計測開始前/);
});

test("analytics stores durable anonymous period/page visitors and sanitized attribution", () => {
  for (const value of ["analyticsVisitorDays", "analyticsPageVisitorDays", "analyticsTrafficDaily", "analyticsTrafficVisitorDays", "utm_source", "utm_medium", "utm_campaign", "referrerDomain", "landingPath"]) assert.match(`${conversions}\n${analytics}`, new RegExp(value));
});

test("dashboard marks pre-measurement traffic and shows source CV components", () => {
  for (const label of ["計測前", "計測期間不足", "新規一般会員", "求人応募", "店舗掲載依頼", "店舗関連閲覧", "dashboardDaily"]) assert.match(admin, new RegExp(label));
});

test("jobs.html is a formal job-list page view", () => { assert.match(analytics, /\(jobs\|girls\|men\)/); });

test("future conversion events keep canonical and compatibility counters", () => {
  for (const field of ["signupCv", "jobApplyCv", "storeApplicationCv", "cv"]) assert.match(conversions, new RegExp(field));
  assert.match(conversions, /analyticsConversionDedupe/);
  assert.match(conversions, /conversions: FieldValue\.increment\(1\)/);
});
