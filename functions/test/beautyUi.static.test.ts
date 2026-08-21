import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(__dirname, "../../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const publicSource = [
  read("pages/beauty.html"),
  read("pages/beauty-brands.html"),
  read("pages/beauty-mireio.html"),
  read("pages/beauty-product.html"),
  read("pages/beauty-shipping-label.js"),
  read("pages/beauty-data.js")
].join("\n");
const adminSource = [
  read("pages/beauty-admin.html"),
  read("pages/beauty-admin.js"),
  read("pages/beauty-admin-enhancements.js")
].join("\n");

test("MIRÈIO initial catalog values are exact", () => {
  for (const expected of [
    "NOX公式パートナーブランド",
    "MIRÈIO",
    "ミルアジュ",
    "MIST",
    "100mL",
    "3600",
    "8800298230002",
    "AMPOULE",
    "30mL",
    "8000",
    "8800298230019",
    "CREAM",
    "50g",
    "6400",
    "8800298230026",
    "three-step-set",
    "18000",
    "送料別途"
  ]) assert.ok(publicSource.includes(expected), `missing ${expected}`);
});

test("beauty sales copy does not use discount claims", () => {
  assert.doesNotMatch(publicSource, /お得|値引き|割引/);
});

test("admin exposes numbered placement, media and commerce controls", () => {
  for (const expected of [
    "① ファーストビュー",
    "② AMPOULE",
    "③ MIST",
    "④ CREAM",
    "⑤ ブランドストーリー",
    "⑥ 3STEP",
    "⑦ 信頼・製造",
    "⑧ 購入直前PR",
    "⑨",
    "⑩",
    "⑪",
    "⑫",
    "追加PRメディア",
    "キャプション",
    "表示順",
    "表示位置",
    "追加画像（最大10枚）",
    "商品動画（最大3本）",
    "銀行振込・送料設定"
  ]) assert.ok(adminSource.includes(expected), `missing ${expected}`);
});

test("admin prioritizes current media and collapses expansion slots", () => {
  for (const expected of [
    "現在使用するメディア",
    "ブランドページ最上部に表示",
    "推奨素材：総合広告画像",
    "AMPOULEの商品説明部分に表示",
    "推奨：アンプル単品画像",
    "MISTの商品説明部分に表示",
    "推奨：ミスト単品画像",
    "CREAMの商品説明部分に表示",
    "推奨：クリーム単品画像",
    "追加メディア・拡張設定（⑤〜⑫）",
    "media-status",
    "visibility-switch"
  ]) assert.ok(adminSource.includes(expected), `missing ${expected}`);
  assert.match(adminSource, /<details class=\"media-details\">/);
  assert.doesNotMatch(adminSource, /<details class=\"media-details\" open>/);
});

test("order UI includes selection, quantity, confirmation and completion", () => {
  const order = read("pages/beauty-order.html") + read("pages/beauty-order.js");
  const complete = read("pages/beauty-complete.html");
  for (const expected of ["productId", "quantity", "注文内容を確認", "注文を確定", "httpsCallable", "submitBeautyOrder"])
    assert.ok(order.includes(expected), `missing ${expected}`);
  for (const expected of ["注文番号", "お振込先（NOX運営者口座）", "送料：", "合計金額："])
    assert.ok(complete.includes(expected), `missing ${expected}`);
});

test("mobile layout has single-column products, large inputs, and fixed CTA", () => {
  const css = read("pages/beauty.css");
  assert.match(css, /@media\(max-width:600px\)/);
  assert.match(css, /\.product-grid[^}]*grid-template-columns:1fr/);
  assert.match(css, /min-height:50px/);
  assert.match(css, /\.mobile-cta\{position:fixed/);
});

test("product page follows the requested content and purchase sequence", () => {
  const product = read("pages/beauty-product.js");
  const ordered = ["mainImage", "product.name", "product.volume", "yen(product.price)", "product.description", "detailMedia", "特徴", "使い方", "全成分", "商品情報", "購入する"];
  let cursor = -1;
  for (const expected of ordered) {
    const next = product.indexOf(expected, cursor + 1);
    assert.ok(next > cursor, `${expected} is out of order`);
    cursor = next;
  }
});

test("saved product main images feed detail, lineup, and 3STEP media", () => {
  const product = read("pages/beauty-product.js");
  const brand = read("pages/beauty.js");
  const brandHtml = read("pages/beauty-mireio.html");
  assert.match(product, /product\.detailMedia \|\| product\.detailImages\?\.\[0\] \|\| product\.mainImage/);
  assert.match(brand, /mediaMarkup\(product\.mainImage, product\.name\)/);
  assert.match(brand, /renderStepImages\(products\)/);
  for (const id of ["mist", "ampoule", "cream"])
    assert.ok(brandHtml.includes(`data-step-product="${id}"`), `missing 3STEP media target for ${id}`);
});

test("brand page includes 3STEP CTA and exact trust and pricing copy", () => {
  const page = read("pages/beauty-mireio.html");
  for (const expected of ["NOX公式パートナーブランド", "魅せる肌を目指す方 必見。", "3STEPで始めるプレミアムケア", "3,600円", "8,000円", "6,400円", "18,000円", "送料別途", "three-step-set"])
    assert.ok(page.includes(expected), `missing ${expected}`);
});

test("premium select polish includes scalable sections, safe mobile CTA, and reduced motion", () => {
  const top = read("pages/beauty.html") + read("pages/beauty-top.js");
  const css = read("pages/beauty-polish.css");
  for (const expected of ["PREMIUM<br>BEAUTY SELECT", "NOXが選ぶ、少し特別な美容アイテム。", "PARTNER BRANDS", "FEATURED", "NEW ARRIVAL", "getBrands"])
    assert.ok(top.includes(expected), `missing ${expected}`);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /min-height:44px/);
});

test("MIRÈIO mobile hero is a full-bleed 4:3 cover without side gutters", () => {
  const css = read("pages/beauty-polish.css");
  assert.match(css, /@media\(max-width:600px\)[^{]*\{[^}]*[\s\S]*?\.mireio-hero \.beauty-hero-media\{width:100vw;max-width:none;margin-left:calc\(50% - 50vw\);margin-right:calc\(50% - 50vw\);padding:0;aspect-ratio:4\/3\}/);
  assert.match(css, /\.mireio-hero \.beauty-hero-media img,[^{]*\{display:block;width:100%;height:100%;max-width:none;margin:0;padding:0;object-fit:cover;object-position:center center\}/);
});

test("payment guidance identifies the NOX operator account without implying MIRÈIO payment", () => {
  const complete = read("pages/beauty-complete.html");
  const admin = read("pages/beauty-admin-enhancements.js");
  for (const expected of [
    "お振込先（NOX運営者口座）",
    "NOXは現在、個人事業として運営しているため",
    "MIRÈIOへの直接振込ではありません",
    "注文日から",
    "振込名義がご注文者様のお名前と異なる場合",
    "ご入金確認後、MIRÈIO販売事業者へ発送手続きを依頼",
    "注文番号",
    "商品代",
    "送料",
    "合計金額"
  ]) assert.ok(complete.includes(expected), `missing ${expected}`);
  for (const expected of ["振込先種別：NOX運営者本人名義", "salesEnabled", "本番テスト完了まではOFF"])
    assert.ok(admin.includes(expected), `missing ${expected}`);
});

test("the active NOX administrator page links to NOX BEAUTY management", () => {
  const admin = read("pages/admin.html");
  assert.match(admin, />NOX BEAUTY管理</);
  assert.match(admin, /href="\/pages\/beauty-admin\.html"/);
});
