import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../..");
const analytics = readFileSync(resolve(root, "analytics.js"), "utf8");
const dashboard = readFileSync(resolve(root, "pages/admin.html"), "utf8");
const diagnosis = readFileSync(resolve(root, "diagnosis.js"), "utf8");

test("page views use a stable anonymous visitor and session reload guard", () => {
  assert.match(analytics, /localStorage/);
  assert.match(analytics, /sessionStorage/);
  assert.match(analytics, /trackPageView/);
  assert.match(analytics, /pv_\$\{location\.pathname\}/);
});

test("ad impressions require actual visibility and are session deduplicated", () => {
  assert.match(analytics, /IntersectionObserver/);
  assert.match(analytics, /intersectionRatio >= 0\.5/);
  assert.match(analytics, /classList\.contains\("active"\)/);
  assert.match(analytics, /imp_\$\{adId\}/);
});

test("AI start and completion are separate events", () => {
  assert.match(diagnosis, /trackAiStart/);
  assert.match(diagnosis, /trackAiComplete/);
  assert.match(analytics, /"ai_start"/);
  assert.match(analytics, /"ai_complete"/);
});

test("dashboard exposes sales KPIs and documented rate formulas", () => {
  assert.match(dashboard, /直近30日 営業用サマリー/);
  assert.match(dashboard, /k\.clicks\s*\/\s*k\.impressions|k\.ctr/);
  assert.match(dashboard, /CVR（CV ÷ UU）/);
  assert.match(dashboard, /dataQuality/);
  assert.match(dashboard, /dashboardQuality/);
});
