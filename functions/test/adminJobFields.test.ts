import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { canonicalJobCompatibilityChanges } from "../src/domain/jobFields";

interface JobFieldsApi { normalize(data: Record<string, unknown>): Record<string, unknown>; featureLabel(value: unknown, enabled?: string): string; }
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

test("admin editing covers public detail fields and saves through manageAdminJob", () => {
  const admin = readFileSync(path.resolve(__dirname, "../../../pages/job-admin.html"), "utf8");
  const detail = readFileSync(path.resolve(__dirname, "../../../pages/job-detail.html"), "utf8");
  for (const id of ["editPosition-", "editAddress-", "editStation-", "editBack-", "editDailyPay-", "editTrial-", "editBeginner-", "editAge-", "editShift-", "editTargetGender-", "editBusinessScope-"]) assert.match(admin, new RegExp(id));
  assert.match(admin, /manageAdminJobCallable/);
  assert.match(admin, /await loadPublishedJobs\(\)/);
  assert.match(detail, /NoxJobFields\.normalize/);
  assert.match(detail, /NoxJobFields\.featureLabel/);
});

test("manage function allowlists expanded fields and builds compatibility fields", () => {
  const source = readFileSync(path.resolve(__dirname, "../../src/callable/manageAdminJob.ts"), "utf8");
  for (const field of ["position", "back", "dailyPay", "trial", "beginner", "age", "shift", "targetGender", "businessScope"]) assert.match(source, new RegExp(`"${field}"`));
  assert.match(source, /canonicalJobCompatibilityChanges/);
});
