import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

interface JobDetailMediaModule {
  compose(data: Record<string, unknown>, storeMedia: Record<string, unknown>, placeholderUrl?: string): {
    heroUrl: string;
    prImageUrls: string[];
    galleryUrls: string[];
  };
}

const media = require(
  path.resolve(__dirname, "../../../pages/job-detail-media.js"),
) as JobDetailMediaModule;
const detailSource = readFileSync(
  path.resolve(__dirname, "../../../pages/job-detail.html"),
  "utf8",
);
const jobsSource = readFileSync(
  path.resolve(__dirname, "../../../pages/jobs.html"),
  "utf8",
);
const menSource = readFileSync(
  path.resolve(__dirname, "../../../pages/men.html"),
  "utf8",
);
const girlsSource = readFileSync(
  path.resolve(__dirname, "../../../pages/girls.html"),
  "utf8",
);

test("keeps the first job-specific image as the main visual", () => {
  const result = media.compose(
    { imageUrls: ["https://example.test/job-1.jpg", "https://example.test/job-2.jpg"] },
    {
      coverImageUrl: "https://example.test/cover.jpg",
      logoUrl: "https://example.test/logo.jpg",
      profileImageUrl: "https://example.test/profile.jpg",
      galleryImages: ["https://example.test/gallery.jpg"],
    },
  );
  assert.equal(result.heroUrl, "https://example.test/job-1.jpg");
  assert.deepEqual(result.prImageUrls, ["https://example.test/job-2.jpg"]);
  assert.deepEqual(result.galleryUrls, [
    "https://example.test/gallery.jpg",
  ]);
});

test("uses the store cover only when the job has no image", () => {
  const result = media.compose(
    {},
    { coverImageUrl: "https://example.test/cover.jpg", galleryImages: [] },
  );
  assert.equal(result.heroUrl, "https://example.test/cover.jpg");
});

test("preserves the existing no-image display when store media is empty", () => {
  assert.deepEqual(media.compose({}, { galleryImages: [] }), {
    heroUrl: "",
    prImageUrls: [],
    galleryUrls: [],
  });
});

test("uses the admin-managed main image before stale compatible image arrays", () => {
  const result = media.compose(
    {
      mainImage: "https://example.test/new-main.jpg",
      imageUrls: ["https://example.test/old-image.jpg"],
      images: ["https://example.test/old-compatible.jpg"],
    },
    { coverImageUrl: "https://example.test/store.jpg", galleryImages: [] },
  );
  assert.equal(result.heroUrl, "https://example.test/new-main.jpg");
});

test("uses the shared placeholder for a storeless public-info job", () => {
  assert.deepEqual(
    media.compose(
      { listingSource: "public_info", storeName: "Public Store" },
      { galleryImages: [] },
      "placeholder.png",
    ),
    { heroUrl: "placeholder.png", prImageUrls: [], galleryUrls: [] },
  );
});

test("public-info detail never uses store media as its hero fallback", () => {
  assert.equal(media.compose(
    { listingSource: "public_info" },
    { coverImageUrl: "https://example.test/unexpected-store.jpg", galleryImages: [] },
    "placeholder.png",
  ).heroUrl, "placeholder.png");
});

test("public detail removes the independent store logo and legacy profile image", () => {
  assert.doesNotMatch(detailSource, /media\.logoUrl/);
  assert.doesNotMatch(detailSource, /media\.profileImageUrl/);
});

test("blocks unpublished jobs before loading store media on the public detail page", () => {
  const visibilityCheck = detailSource.indexOf('data.status !== "approved"');
  const mediaLoad = detailSource.indexOf("const storeMedia = await loadStoreMedia()");

  assert.notEqual(visibilityCheck, -1);
  assert.match(detailSource, /data\.isPublic !== true/);
  assert.match(detailSource, /data\.contractListingStatus !== "active"/);
  assert.match(detailSource, /現在この求人は掲載されていません/);
  assert.ok(visibilityCheck < mediaLoad);
});

test("keeps all three publication checks in every public job list", () => {
  for (const source of [jobsSource, menSource, girlsSource]) {
    assert.match(source, /job\.status !== "approved"/);
    assert.match(source, /job\.isPublic !== true/);
    assert.match(source, /job\.contractListingStatus !== "active"/);
  }
});

test("every public job list constrains its Firestore query to fields allowed by rules", () => {
  for (const source of [jobsSource, menSource, girlsSource]) {
    assert.match(source, /where\("status",\s*"==",\s*"approved"\)/);
    assert.match(source, /where\("isPublic",\s*"==",\s*true\)/);
    assert.match(source, /where\("contractListingStatus",\s*"==",\s*"active"\)/);
  }
});

test("public job cards isolate rendering errors per job", () => {
  for (const source of [jobsSource, menSource, girlsSource]) {
    assert.match(source, /求人カードの描画をスキップしました/);
  }
});

test("public job lists exclude only explicit test and dummy flags", () => {
  for (const source of [jobsSource, menSource, girlsSource]) {
    assert.match(source, /job\.isTest === true/);
    assert.match(source, /job\.isDummy === true/);
    assert.doesNotMatch(source, /textCheck\.includes\("(?:テスト|test|dummy)"\)/);
  }
});

test("the male job list keeps its existing gender check", () => {
  assert.match(menSource, /function isMaleJob\(job\)/);
  assert.match(menSource, /targetValue === "female"/);
  assert.match(menSource, /if\(!isMaleJob\(job\)\)/);
});
