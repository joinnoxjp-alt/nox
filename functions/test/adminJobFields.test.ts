import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { canonicalJobCompatibilityChanges } from "../src/domain/jobFields";

interface JobFieldsApi { normalize(data: Record<string, unknown>): Record<string, unknown>; featureLabel(value: unknown, enabled?: string): string; applyTypeLabel(value: string): string; listingSourceLabel(value?: string): string; }
const fields = require(path.resolve(__dirname, "../../../pages/job-fields.js")) as JobFieldsApi;

test("canonical fields stay aligned without mixing area and business", () => {
  const result = canonicalJobCompatibilityChanges({ storeName: "Store", title: "Title", businessType: "Bar", area: "Tokyo", salary: "3000", description: "Description", workHours: "20-1", requirements: "18+", benefits: "Transport", applyUrl: "https://example.test" });
  assert.equal(result.jobTitle, "Title");
  assert.equal(result.jobType, "Bar");
  assert.equal(result.location, "Tokyo");
  assert.notEqual(result.location, result.jobType);
});

test("legacy jobs normalize and booleans are not rendered as raw values", () => {
  const normalized = fields.normalize({ jobTitle: "Legacy", jobType: "Club", location: "Osaka" });
  assert.equal(normalized.title, "Legacy");
  assert.equal(normalized.businessType, "Club");
  assert.equal(normalized.area, "Osaka");
  assert.notEqual(fields.featureLabel(true), "true");
  assert.notEqual(fields.featureLabel(false), "false");
});

test("closed day uses the canonical field and supports legacy fallbacks", () => {
  for (const closedDay of ["日曜日", "不定休", "年中無休", "月曜・祝日"]) {
    assert.equal(fields.normalize({ closedDay }).closedDay, closedDay);
    assert.equal(canonicalJobCompatibilityChanges({ closedDay }).closedDay, closedDay);
  }
  for (const legacyField of ["holiday", "holidays", "closedDays", "regularHoliday", "dayOff"]) {
    assert.equal(fields.normalize({ [legacyField]: "日曜日" }).closedDay, "日曜日");
    assert.equal(canonicalJobCompatibilityChanges({ [legacyField]: "日曜日" }).closedDay, "日曜日");
  }
  assert.equal(canonicalJobCompatibilityChanges({ closedDay: "", holiday: "日曜日" }).closedDay, "");
  assert.equal(fields.normalize({ closedDay: "", holiday: "日曜日" }).closedDay, "");
  assert.equal(fields.normalize({}).closedDay, "");
  assert.equal(canonicalJobCompatibilityChanges({}).closedDay, "");
});

test("admin editing covers public detail fields and saves through manageAdminJob", () => {
  const admin = readFileSync(path.resolve(__dirname, "../../../pages/job-admin.html"), "utf8");
  const detail = readFileSync(path.resolve(__dirname, "../../../pages/job-detail.html"), "utf8");
  const directCreate = readFileSync(path.resolve(__dirname, "../../../pages/admin.html"), "utf8");
  assert.match(admin, /editClosedDay-/);
  assert.match(directCreate, /directJobClosedDay/);
  assert.match(detail, /job\.closedDay \?/);
  for (const id of ["editPosition-", "editAddress-", "editStation-", "editBack-", "editDailyPay-", "editTrial-", "editBeginner-", "editAge-", "editShift-", "editTargetGender-", "editBusinessScope-"]) assert.match(admin, new RegExp(id));
  assert.match(admin, /manageAdminJobCallable/);
  assert.match(admin, /await loadPublishedJobs\(\)/);
  assert.match(detail, /NoxJobFields\.normalize/);
  assert.match(detail, /NoxJobFields\.featureLabel/);
});

test("manage function allowlists expanded fields and builds compatibility fields", () => {
  const source = readFileSync(path.resolve(__dirname, "../../src/callable/manageAdminJob.ts"), "utf8");
  assert.match(source, /"closedDay"/);
  for (const field of ["position", "back", "dailyPay", "trial", "beginner", "age", "shift", "targetGender", "businessScope"]) assert.match(source, new RegExp(`"${field}"`));
  assert.match(source, /canonicalJobCompatibilityChanges/);
  assert.match(source, /"applyType"/);
  assert.match(source, /Application URL must use HTTP or HTTPS/);
});

test("application destination normalizes canonical and legacy URL fields", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(fields.normalize({ applyType: "instagram", applyUrl: "https://instagram.com/store" })).filter(([key]) => ["applyType", "applyUrl"].includes(key))),
    { applyType: "instagram", applyUrl: "https://instagram.com/store" },
  );
  const legacyLine = fields.normalize({ lineUrl: "https://lin.ee/store" });
  assert.equal(legacyLine.applyType, "line");
  assert.equal(legacyLine.applyUrl, "https://lin.ee/store");
  const legacyInstagram = fields.normalize({ instagramUrl: "https://instagram.com/legacy" });
  assert.equal(legacyInstagram.applyType, "instagram");
  assert.equal(legacyInstagram.applyUrl, "https://instagram.com/legacy");
});

test("direct admin creation validates and sends the canonical closed day", () => {
  const admin = readFileSync(path.resolve(__dirname, "../../../pages/admin.html"), "utf8");
  const source = readFileSync(path.resolve(__dirname, "../../src/callable/createAdminJob.ts"), "utf8");
  assert.match(admin, /id="directJobClosedDay"/);
  assert.match(admin, /const closedDay = document\.getElementById\("directJobClosedDay"\)/);
  assert.match(admin, /createAdminJobCallable\(\{[\s\S]*closedDay,/);
  assert.match(source, /closedDay: optionalString\(input\.closedDay, 200\)/);
  assert.match(source, /closedDay: input\.closedDay/);
});

test("listing source defaults legacy jobs to official and labels both sources", () => {
  assert.equal(fields.normalize({}).listingSource, "official");
  assert.equal(fields.normalize({ listingSource: "public_info" }).listingSource, "public_info");
  assert.equal(fields.listingSourceLabel(), "NOX掲載店舗");
  assert.equal(fields.listingSourceLabel("public_info"), "公開情報確認済");
});

test("admin source metadata is handled only by trusted job functions", () => {
  const admin = readFileSync(path.resolve(__dirname, "../../../pages/job-admin.html"), "utf8");
  const directCreate = readFileSync(path.resolve(__dirname, "../../../pages/admin.html"), "utf8");
  const createSource = readFileSync(path.resolve(__dirname, "../../src/callable/createAdminJob.ts"), "utf8");
  const manageSource = readFileSync(path.resolve(__dirname, "../../src/callable/manageAdminJob.ts"), "utf8");
  for (const field of ["listingSource", "sourceUrl", "sourceCheckedAt", "adminSourceMemo"]) {
    assert.match(createSource, new RegExp(field));
    assert.match(manageSource, new RegExp(field));
  }
  assert.match(directCreate, /id="directJobListingSource"/);
  assert.match(admin, /id="editListingSource-/);
  assert.match(admin, /情報確認日を今日に更新/);
});
