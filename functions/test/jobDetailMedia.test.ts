import assert from "node:assert/strict";
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
