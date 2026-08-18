import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  fallbackMetadata, isPublicJob, isPublicWorkJob, isSafePublicId,
  jobMetadata, NOX_FALLBACK_IMAGE, NOX_WORK_FALLBACK_IMAGE,
  renderShareHtml, storeMetadata, workJobMetadata,
} from "../src/domain/shareOgp";

test("share IDs are allowlisted", () => {
  assert.equal(isSafePublicId("abc_DEF-123"), true);
  assert.equal(isSafePublicId("../secret"), false);
  assert.equal(isSafePublicId("<script>"), false);
});

test("only currently public jobs can be shared", () => {
  assert.equal(isPublicJob({ status: "approved", isPublic: true, contractListingStatus: "active" }), true);
  assert.equal(isPublicJob({ status: "paused", isPublic: true, contractListingStatus: "active" }), false);
  assert.equal(isPublicWorkJob({ status: "published", isPublic: true }, "2026-08-19"), true);
  assert.equal(isPublicWorkJob({ status: "published", isPublic: true, publishStartDate: "2026-08-20" }, "2026-08-19"), false);
});

test("job metadata uses distinct public job values and main image", () => {
  const first = jobMetadata("jobA", { storeName: "店舗A", title: "求人A", salary: "時給5,000円", area: "新宿", mainImage: "https://example.com/a.jpg" }, "https://share.test/jobA");
  const second = jobMetadata("jobB", { storeName: "店舗B", title: "求人B", imageUrls: ["https://example.com/b.jpg"] }, "https://share.test/jobB");
  assert.equal(first.title, "店舗A｜求人A｜NOX");
  assert.match(first.description, /時給5,000円・新宿/);
  assert.equal(first.image, "https://example.com/a.jpg");
  assert.equal(second.title, "店舗B｜求人B｜NOX");
  assert.equal(second.image, "https://example.com/b.jpg");
  assert.notEqual(first.title, second.title);
});

test("store and work metadata apply image priority and fallbacks", () => {
  const store = storeMetadata("storeA", { storeName: "店舗A", category: "ラウンジ", coverImageUrl: "https://example.com/cover.jpg", mainImageUrl: "https://example.com/profile.jpg" }, "https://share.test/storeA");
  assert.equal(store.title, "店舗A｜NOX");
  assert.equal(store.image, "https://example.com/cover.jpg");
  const work = workJobMetadata("workA", { companyName: "企業A", title: "正社員募集" }, "https://share.test/workA");
  assert.equal(work.title, "企業A｜正社員募集｜NOX WORK");
  assert.equal(work.image, NOX_WORK_FALLBACK_IMAGE);
  assert.equal(fallbackMetadata("https://share.test/missing").image, NOX_FALLBACK_IMAGE);
});

test("rendered response contains server-side OGP, Twitter tags, safe redirect and escaping", () => {
  const html = renderShareHtml({
    title: "<script>alert(1)</script>", description: '説明"引用', image: "https://example.com/a.jpg",
    shareUrl: "https://share.test/job?id=a", destinationUrl: "https://joinnox.jp/pages/job-detail.html?id=a",
  });
  for (const property of ["og:title", "og:description", "og:image", "og:url", "twitter:card", "twitter:title", "twitter:description", "twitter:image"]) {
    assert.match(html, new RegExp(`(?:property|name)="${property}"`));
  }
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /window\.location\.replace/);
});

test("three public detail pages share dedicated OGP URLs without changing destination links", () => {
  const root = path.resolve(__dirname, "../../..");
  const job = readFileSync(path.join(root, "pages/job-detail.html"), "utf8");
  const store = readFileSync(path.join(root, "pages/store-detail.js"), "utf8");
  const work = readFileSync(path.join(root, "day/job-detail.html"), "utf8");
  assert.match(job, /cloudfunctions\.net\/shareJob\?id=/);
  assert.match(store, /cloudfunctions\.net\/shareStore\?id=/);
  assert.match(work, /cloudfunctions\.net\/shareWorkJob\?id=/);
  assert.match(job, /id="applyBtn"/);
  assert.match(store, /submitStoreReservation/);
  assert.match(work, /href=\"\$\{esc\(href\)\}/);
});
