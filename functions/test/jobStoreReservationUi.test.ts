import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const detail = readFileSync(resolve(__dirname, "../../../pages/job-detail.html"), "utf8");

test("job detail shows the reservation CTA only for a published NOX form page", () => {
  assert.match(detail, /customerPage\?\.reservationFormEnabled !== true/);
  assert.match(detail, /store-detail\.html\?id=\$\{encodeURIComponent\(storeId\)\}&jobId=\$\{encodeURIComponent\(id\)\}#reservationForm/);
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
  assert.match(storeDetail, /await submit\(\{\.\.\.data,storeId,jobId,people:/);
  assert.match(storeDetail, /予約リクエストを送信しました。店舗またはNOX運営からの確認連絡をお待ちください。/);
  assert.match(storeDetail, /code\.includes\("invalid-argument"\)/);
});

test("admin reservation list shows NOX source, benefit, job and Japanese status", () => {
  const admin = readFileSync(resolve(__dirname, "../../../pages/admin-store-customer.js"), "utf8");
  assert.match(admin, /new:\s*'確認待ち'/);
  assert.match(admin, /「NOXを見た」でのご予約/);
  assert.match(admin, /benefitEligible/);
  assert.match(admin, /jobId/);
});

test("ordinary jobs keep the existing application CTA and handler", () => {
  assert.match(detail, /id="applyBtn"/);
  assert.match(detail, /applyBtn\.addEventListener\("click"/);
  assert.doesNotMatch(detail, /if \(!noRecruiting[^\n]*applyButton\.hidden/);
});

test("admin embeds the customer page editor as a lazy closed accordion", () => {
  const admin = readFileSync(resolve(__dirname, "../../../pages/admin.html"), "utf8");
  assert.match(admin, /id="storeCustomerPageAdminSection"/);
  assert.match(admin, />店舗予約・遊びに行く情報管理</);
  assert.match(admin, /data-src="\.\/admin-store-customer\.html\?embedded=1"/);
  assert.match(admin, /frame\.src = frame\.dataset\.src/);
});

test("customer editor exposes requested fields without adding a cover upload", () => {
  const editor = readFileSync(resolve(__dirname, "../../../pages/admin-store-customer.html"), "utf8");
  const editorScript = readFileSync(resolve(__dirname, "../../../pages/admin-store-customer.js"), "utf8");
  for (const name of ["instagramReservationEnabled", "xReservationEnabled", "tiktokReservationEnabled", "externalReservationLabel", "pricesText", "benefitExpiresAt"]) {
    assert.match(editor, new RegExp(`name="${name}"`));
  }
  assert.match(editor, /id="mainFile"/);
  assert.match(editor, /id="galleryFiles"[^>]*multiple/);
  assert.doesNotMatch(editor, /id="coverFile"/);
  assert.match(editorScript, /この店舗の遊び・予約情報を更新します。よろしいですか？/);
  assert.match(editorScript, /店舗情報を更新しました/);
});

test("public customer page renders enabled social reservation channels and profile image", () => {
  const storeDetail = readFileSync(resolve(__dirname, "../../../pages/store-detail.js"), "utf8");
  assert.match(storeDetail, /page\.instagramReservationEnabled&&safe\(page\.instagramUrl\)/);
  assert.match(storeDetail, /page\.xReservationEnabled&&safe\(page\.xUrl\)/);
  assert.match(storeDetail, /page\.tiktokReservationEnabled&&safe\(page\.tiktokUrl\)/);
  assert.match(storeDetail, /page\.externalReservationLabel\|\|'予約サイトへ'/);
  assert.match(storeDetail, /class="store-profile-image"/);
});

test("successful admin save clears only pending local image selections", () => {
  const editorScript = readFileSync(resolve(__dirname, "../../../pages/admin-store-customer.js"), "utf8");
  assert.match(editorScript, /await save\(\{ action: 'save', page \}\);\s*document\.getElementById\('mainFile'\)\.value = '';\s*document\.getElementById\('galleryFiles'\)\.value = '';/);
  assert.match(editorScript, /await reload\(\)/);
  assert.doesNotMatch(editorScript, /images\.galleryImages\s*=\s*\[\]\s*;/);
});

test("public store gallery has an accessible full-screen viewer", () => {
  const storeDetail = readFileSync(resolve(__dirname, "../../../pages/store-detail.js"), "utf8");
  const styles = readFileSync(resolve(__dirname, "../../../pages/store-customer.css"), "utf8");
  assert.match(storeDetail, /data-gallery-index/);
  assert.match(storeDetail, /role="dialog" aria-modal="true"/);
  assert.match(storeDetail, /event\.key==="Escape"/);
  assert.match(storeDetail, /event\.key==="ArrowLeft"/);
  assert.match(storeDetail, /event\.key==="ArrowRight"/);
  assert.match(storeDetail, /event\.target===viewer\|\|event\.target\.classList\.contains\("store-image-viewer-stage"\)/);
  assert.match(styles, /body\.store-image-viewer-open \{ overflow:hidden; \}/);
  assert.match(styles, /\.store-image-viewer-nav\[hidden\] \{ display:none; \}/);
  assert.match(styles, /touch-action:pan-x pan-y pinch-zoom/);
  assert.match(styles, /100dvh/);
});
