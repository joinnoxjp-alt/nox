import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseWorkJob } from "../src/domain/adminWorkInput";

const root = path.resolve(__dirname, "../../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

test("NOX WORK uses isolated collections and storage paths", () => {
  const sources = read("functions/src/callable/manageAdminWorkJob.ts") + read("functions/src/callable/manageAdminWorkCompany.ts");
  assert.match(sources, /workJobs/); assert.match(sources, /workCompanies/);
  assert.doesNotMatch(sources, /collection\("jobs"\)|collection\("stores"\)/);
  const ui = read("day/work-admin.js");
  assert.match(ui, /work-images\//); assert.match(ui, /work-companies\//);
});

test("all administrator operations require fixed active-admin authorization", () => {
  for (const file of ["manageAdminWorkJob.ts", "manageAdminWorkCompany.ts", "getAdminWorkData.ts"]) {
    assert.match(read(`functions/src/callable/${file}`), /assertActiveAdmin\(request\.auth\)/);
  }
  assert.match(read("storage.rules"), /match \/work-images[\s\S]*isFixedActiveAdmin/);
});

test("general job input includes required work fields and excludes night-only fields", () => {
  const parsed = parseWorkJob({ companyId:"c1", companyName:"RanRunLive", title:"TikTok LIVE配信者", industry:"配信事務所", occupation:"ライバー", employmentType:"業務委託", salary:"成果報酬", location:"全国", description:"ライブ配信", beginnerWelcome:true, applyType:"line", applyValue:"https://lin.ee/example", status:"published", publishStartDate:"2026-08-01", publishEndDate:"2026-12-31" });
  assert.equal(parsed.applyType, "line"); assert.equal(parsed.status, "published"); assert.equal(parsed.beginnerWelcome, true);
  for (const nightField of ["dailyPay", "trial", "back", "targetGender", "businessScope"]) assert.equal(nightField in parsed, false);
});

test("invalid URLs, periods and status values are rejected", () => {
  const base = { companyId:"c1", companyName:"Company", title:"Title", industry:"Food", occupation:"Staff", employmentType:"Full-time", salary:"300000", location:"Tokyo", description:"Work", applyType:"line", applyValue:"https://lin.ee/test" };
  assert.throws(() => parseWorkJob({ ...base, applyValue:"javascript:alert(1)" }));
  assert.throws(() => parseWorkJob({ ...base, status:"approved" }));
  assert.throws(() => parseWorkJob({ ...base, publishStartDate:"2026/08/01" }));
  assert.throws(() => parseWorkJob({ ...base, applyType:"email", applyValue:"invalid" }));
  assert.throws(() => parseWorkJob({ ...base, applyType:"phone", applyValue:"123" }));
});

test("public callable exposes an allowlist and excludes private fields", () => {
  const source = read("functions/src/callable/getPublicWorkJobs.ts");
  assert.match(source, /PUBLIC_FIELDS/); assert.match(source, /status === "published"/); assert.match(source, /publishStartDate/); assert.match(source, /publishEndDate/);
  assert.doesNotMatch(source.match(/const PUBLIC_FIELDS[^;]+/)?.[0] || "", /adminMemo|StoragePath|createdBy|updatedBy/);
});

test("administrator UI supports create edit publish pause delete and company management", () => {
  const page = read("day/admin.html"), script = read("day/work-admin.js");
  for (const id of ["jobTitle","jobIndustry","jobOccupation","jobEmploymentType","jobSalary","jobLocation","jobStation","jobWorkHours","jobHolidays","jobDescription","jobRequirements","jobBenefits","jobBeginnerWelcome","jobAgeRequirement","jobMainFile","jobLogoFile","jobApplyType","jobApplyValue","jobPublishStartDate","jobPublishEndDate"]) assert.match(page, new RegExp(`id="${id}"`));
  for (const action of ["save","status","delete"]) assert.match(script, new RegExp(`action:\"${action}\"`));
  assert.match(script, /requireActiveAdmin/);
});

test("public detail sends applicants directly to configured destination", () => {
  const detail = read("day/job-detail.html");
  assert.match(detail, /applyHref/); assert.match(detail, /mailto:/); assert.match(detail, /tel:/); assert.match(detail, /公式LINE/); assert.match(detail, />応募する</);
});
