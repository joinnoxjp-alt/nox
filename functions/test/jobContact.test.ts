import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  extractJobContactFromAdminMemo,
  isCasablancaGroupJob,
  normalizeContactEmail,
  normalizeContactPhone,
} from "../src/domain/jobContact";
import { parseAdminJobInput } from "../src/domain/adminJobInput";

const baseInput = {
  listingSource: "public_info", storeName: "五十路マダム 岡山店", ownerId: "",
  title: "スタッフ募集", businessType: "店舗スタッフ", applyType: "line",
};

test("admin creation normalizes and accepts job contact fields", () => {
  const input = parseAdminJobInput({ ...baseInput, contactPhone: "０８６－２３８－４８３０／０８０－２８８０－１３５９", contactEmail: " Recruit@Example.COM " });
  assert.equal(input.contactPhone, "086-238-4830 / 080-2880-1359");
  assert.equal(input.contactEmail, "recruit@example.com");
});

test("contact fields may be unset and invalid email is rejected", () => {
  const input = parseAdminJobInput(baseInput);
  assert.equal(input.contactPhone, "");
  assert.equal(input.contactEmail, "");
  assert.throws(() => parseAdminJobInput({ ...baseInput, contactEmail: "not-an-email" }), /問い合わせ先/);
});

test("TEL and MAIL are extracted only from explicit memo labels", () => {
  const result = extractJobContactFromAdminMemo("受付情報\nTEL：086-238-4830 / 080-2880-1359\nMAIL: recruit@example.com");
  assert.equal(result.contactPhone, "086-238-4830 / 080-2880-1359");
  assert.equal(result.contactEmail, "recruit@example.com");
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(extractJobContactFromAdminMemo("連絡先は店舗サイト参照"), { contactPhone: "", contactEmail: "", warnings: [] });
});

test("invalid extracted values are reported without guessing", () => {
  const result = extractJobContactFromAdminMemo("TEL: 123\nMAIL: invalid");
  assert.equal(result.contactPhone, "");
  assert.equal(result.contactEmail, "");
  assert.deepEqual(result.warnings.sort(), ["invalid-email", "invalid-phone"]);
});

test("preview targeting excludes unrelated jobs", () => {
  assert.equal(isCasablancaGroupJob({ storeName: "五十路マダム Express横浜店" }), true);
  assert.equal(isCasablancaGroupJob({ adminSourceMemo: "カサブランカグループ求人" }), true);
  assert.equal(isCasablancaGroupJob({ storeName: "別グループの店舗" }), false);
});

test("normalizers reject malformed public contact data", () => {
  assert.throws(() => normalizeContactPhone("call us"));
  assert.throws(() => normalizeContactEmail("a@localhost"));
});

test("public detail renders contacts under apply and never renders admin memo", () => {
  const detail = readFileSync(path.resolve(__dirname, "../../../pages/job-detail.html"), "utf8");
  const applyIndex = detail.indexOf('id="applyBtn"');
  const contactIndex = detail.indexOf("${fallbackContact}");
  assert.ok(applyIndex >= 0 && contactIndex > applyIndex);
  assert.match(detail, /SNSが開けない場合のお問い合わせ先/);
  assert.match(detail, /href="tel:/);
  assert.match(detail, /href="mailto:/);
  assert.doesNotMatch(detail, /adminSourceMemo/);
});
