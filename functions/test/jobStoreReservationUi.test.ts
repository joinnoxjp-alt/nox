import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const detail = readFileSync(resolve(__dirname, "../../../pages/job-detail.html"), "utf8");

test("job detail shows the reservation CTA only for a published NOX form page", () => {
  assert.match(detail, /customerPage\?\.reservationFormEnabled !== true/);
  assert.match(detail, /store-detail\.html\?id=\$\{encodeURIComponent\(storeId\)\}#reservationForm/);
  assert.match(detail, />お店を予約する<\/a>/);
});

test("currently-not-recruiting jobs hide only the existing application button", () => {
  assert.match(detail, /includes\("現在求人募集なし"\)/);
  assert.match(detail, /求人募集\(\?:を\)\?\(\?:行っておりません/);
  assert.match(detail, /if \(noRecruiting && applyButton\) applyButton\.hidden = true/);
  assert.match(detail, /setupApplication\(data\)/);
});

test("reservation hash is handled after the asynchronous form render", () => {
  const storeDetail = readFileSync(resolve(__dirname, "../../../pages/store-detail.js"), "utf8");
  assert.match(storeDetail, /location\.hash==="#reservationForm"/);
  assert.match(storeDetail, /form\.scrollIntoView\(\{behavior:"smooth",block:"start"\}\)/);
});

test("ordinary jobs keep the existing application CTA and handler", () => {
  assert.match(detail, /id="applyBtn"/);
  assert.match(detail, /applyBtn\.addEventListener\("click"/);
  assert.doesNotMatch(detail, /if \(!noRecruiting[^\n]*applyButton\.hidden/);
});
