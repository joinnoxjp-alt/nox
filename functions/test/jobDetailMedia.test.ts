import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

interface JobDetailMediaModule {
  compose(data: Record<string, unknown>, storeMedia: Record<string, unknown>): {
    heroUrl: string;
    logoUrl: string;
    profileImageUrl: string;
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
  assert.deepEqual(result.galleryUrls, [
    "https://example.test/job-1.jpg",
    "https://example.test/job-2.jpg",
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
    logoUrl: "",
    profileImageUrl: "",
    galleryUrls: [],
  });
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
