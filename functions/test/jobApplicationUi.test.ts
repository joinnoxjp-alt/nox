import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const detail = readFileSync(path.resolve(__dirname, "../../../pages/job-detail.html"), "utf8");
const admin = readFileSync(path.resolve(__dirname, "../../../pages/job-admin.html"), "utf8");
const adminDashboard = readFileSync(path.resolve(__dirname, "../../../pages/admin.html"), "utf8");
const createFunction = readFileSync(path.resolve(__dirname, "../../src/callable/createAdminJob.ts"), "utf8");

test("store and hero images use contain and support full-size dialogs", () => {
  assert.match(detail, /\.hero img[\s\S]*object-fit:\s*contain/);
  assert.match(detail, /\.gallery img[\s\S]*object-fit:\s*contain/);
  assert.match(detail, /data-full-image/);
  assert.match(detail, /id="imageDialog"/);
});

test("long job text is left aligned and preserves paragraph breaks", () => {
  assert.match(detail, /\.long-text[\s\S]*text-align:\s*left/);
  assert.match(detail, /\.long-text[\s\S]*white-space:\s*pre-wrap/);
  assert.match(detail, /class="pr"/);
  assert.match(detail, /class="long-text"/);
});

test("application flow copies locally and never stores applicant personal data", () => {
  assert.match(detail, /id="applyDialog"/);
  assert.match(detail, /id="entryName"/);
  assert.match(detail, /id="entryPhone"/);
  assert.match(detail, /NOXを見て応募しました/);
  assert.match(detail, /navigator\.clipboard/);
  assert.doesNotMatch(detail, /collection\(db,\s*"applications"\)/);
  assert.doesNotMatch(detail, /applicantName|applicantPhone/);
});

test("external application URL is fail-closed and opened safely", () => {
  assert.match(detail, /parsed\.protocol === "https:" \|\| parsed\.protocol === "http:"/);
  assert.match(detail, /rel="noopener noreferrer"/);
  assert.match(detail, /現在、この求人の応募先が設定されていません/);
});

test("admin edits canonical per-job application type and URL", () => {
  assert.match(admin, /id="editApplyType-/);
  assert.match(admin, /id="editApplyUrl-/);
  assert.match(admin, /applyType,/);
  assert.match(admin, /applyUrl,/);
  assert.doesNotMatch(admin, /lineUrl:applyUrl/);
});

test("admin direct creation validates and saves canonical application fields", () => {
  assert.match(adminDashboard, /id="directJobApplyType"/);
  assert.match(adminDashboard, /id="directJobApplyUrl"/);
  assert.match(adminDashboard, /isValidHttpUrl\(applyUrl\)/);
  assert.match(createFunction, /safeOptionalUrl/);
  assert.match(createFunction, /applyType: input\.applyType/);
  assert.match(createFunction, /applyUrl: input\.applyUrl/);
});

test("public information jobs have distinct, non-endorsement UI", () => {
  assert.match(detail, /公開情報確認済/);
  assert.match(detail, /店舗によるNOXへの掲載内容の確認・承認・提携を示すものではありません/);
  assert.match(detail, /この求人について相談する/);
});
