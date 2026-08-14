import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { dashboardCvr, dashboardDateKey, dashboardPeriodStart } from "../src/callable/getAdminDashboard";

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

test("CVR is returned only when UU covers the complete selected period", () => {
  assert.deepEqual(dashboardCvr(15, 18, false), { eligible: false, value: null });
  assert.deepEqual(dashboardCvr(3, 12, true), { eligible: true, value: 25 });
  assert.deepEqual(dashboardCvr(0, 0, true), { eligible: false, value: null });
});

test("dashboard authenticates before server-side source aggregation", () => {
  const handler = callable.slice(callable.indexOf("export const getAdminDashboard"));
  assert.ok(handler.indexOf("await assertActiveAdmin") < handler.indexOf("Promise.all"));
  for (const collection of ["users", "applications", "jobEntries", "storeApplications", "jobViewStats", "storeViewStats", "analyticsDaily", "adDailyStats"]) assert.match(callable, new RegExp(`\\"${collection}\\"`));
  assert.match(callable, /role", "==", "user"/);
  assert.match(callable, /applicationKey/);
  assert.doesNotMatch(callable, /count\("jobApplications"/);
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
