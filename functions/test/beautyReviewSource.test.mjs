import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOptionalSourceUrl, safeSourceUrl } from "../../pages/beauty-review-source.mjs";

test("an empty source URL is valid and is stored as an empty string", () => {
  assert.equal(normalizeOptionalSourceUrl(""), "");
  assert.equal(normalizeOptionalSourceUrl("   "), "");
});

test("an HTTPS source URL is accepted and normalized", () => {
  assert.equal(normalizeOptionalSourceUrl("https://example.com/post"), "https://example.com/post");
});

test("an HTTP source URL is rejected", () => {
  assert.throws(() => normalizeOptionalSourceUrl("http://example.com/post"), /HTTPS/);
});

test("invalid public source URLs produce no link target", () => {
  assert.equal(safeSourceUrl(""), "");
  assert.equal(safeSourceUrl("http://example.com/post"), "");
  assert.equal(safeSourceUrl("https://example.com/post"), "https://example.com/post");
});
