import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

interface JobCardMediaModule {
  select(job: Record<string, unknown>, placeholderUrl: string): string;
}

const media = require(
  path.resolve(__dirname, "../../../pages/job-card-media.js"),
) as JobCardMediaModule;

test("prefers the canonical job main image over compatible and store images", () => {
  assert.equal(
    media.select({
      imageUrls: ["", "https://example.test/job.jpg"],
      mainImage: "https://example.test/legacy.jpg",
      storeCoverImageUrl: "https://example.test/cover.jpg",
    }, "placeholder.png"),
    "https://example.test/legacy.jpg",
  );
});

test("uses legacy job images before the store cover", () => {
  assert.equal(
    media.select({
      imageUrls: [],
      mainImage: "https://example.test/legacy.jpg",
      storeCoverImageUrl: "https://example.test/cover.jpg",
    }, "placeholder.png"),
    "https://example.test/legacy.jpg",
  );
});

test("uses the store cover only when the job has no own image", () => {
  assert.equal(
    media.select({
      imageUrls: [],
      images: [],
      storeCoverImageUrl: "https://example.test/cover.jpg",
    }, "placeholder.png"),
    "https://example.test/cover.jpg",
  );
});

test("uses the placeholder when neither job nor store images exist", () => {
  assert.equal(media.select({ imageUrls: [] }, "placeholder.png"), "placeholder.png");
});

test("public-info jobs never depend on a cached store cover", () => {
  assert.equal(media.select({
    listingSource: "public_info",
    storeCoverImageUrl: "https://example.test/cover.jpg",
  }, "placeholder.png"), "placeholder.png");
});

test("TOP and all public lists use the shared card image selector", () => {
  const files = ["index.html", "script.js", "pages/jobs.html", "pages/girls.html", "pages/men.html"];
  const sources = Object.fromEntries(files.map((file) => [
    file,
    readFileSync(path.resolve(__dirname, `../../../${file}`), "utf8"),
  ]));
  assert.match(sources["index.html"], /pages\/job-card-media\.js/);
  assert.match(sources["script.js"], /NoxJobCardMedia\.select/);
  assert.match(sources["script.js"], /typeof window\.NoxJobCardMedia\?\.select === "function"/);
  for (const file of files.slice(2)) {
    assert.match(sources[file], /\.\/job-fields\.js/);
    assert.match(sources[file], /\.\/job-card-media\.js/);
    assert.match(sources[file], /NoxJobCardMedia\.select/);
    assert.match(sources[file], /class="job-card-image"/);
    assert.match(sources[file], /typeof window\.NoxJobCardMedia\?\.select === "function"/);
    assert.match(sources[file], /: placeholderImageUrl/);
  }
});
