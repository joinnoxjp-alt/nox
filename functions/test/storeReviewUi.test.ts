import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(__dirname, "../../..");
const form = readFileSync(path.join(root, "pages/store-review.js"), "utf8");
const publicReviews = readFileSync(path.join(root, "pages/store-reviews.js"), "utf8");
const admin = readFileSync(path.join(root, "pages/admin-store-reviews.js"), "utf8");
const rules = readFileSync(path.join(root, "firestore.rules"), "utf8");

test("public submission is always pending and hidden", () => {
  assert.match(form, /status:\s*"pending"/);
  assert.match(form, /isPublic:\s*false/);
  assert.match(form, /createdAt:\s*serverTimestamp\(\)/);
  assert.match(form, /submitting = true; button\.disabled = true/);
  assert.match(rules, /request\.resource\.data\.status == "pending"/);
  assert.match(rules, /request\.resource\.data\.isPublic == false/);
  assert.match(rules, /request\.resource\.data\.featured == false/);
  assert.match(rules, /request\.resource\.data\.storeId == ""/);
});

test("public pages request only approved and public reviews", () => {
  assert.match(publicReviews, /where\("status", "==", "approved"\)/);
  assert.match(publicReviews, /where\("isPublic", "==", true\)/);
  assert.match(rules, /resource\.data\.status == "approved" && resource\.data\.isPublic == true/);
});

test("anonymous reviews hide store identity and non-consenting reviews cannot be approved", () => {
  assert.match(publicReviews, /anonymous \? "掲載店舗様"/);
  assert.match(publicReviews, /!anonymous && review\.storeLogoUrl/);
  assert.match(admin, /review\.publishPermission==="none"/);
  assert.match(rules, /publishPermission in \["named", "anonymous"\]/);
});

test("review content is rendered with textContent rather than HTML interpolation", () => {
  assert.match(publicReviews, /node\.textContent = value/);
  assert.doesNotMatch(publicReviews, /innerHTML/);
  assert.doesNotMatch(admin, /innerHTML/);
});
