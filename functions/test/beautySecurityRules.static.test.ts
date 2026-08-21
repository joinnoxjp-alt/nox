import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(__dirname, "../../..");
const firestoreRules = readFileSync(path.join(root, "firestore.rules"), "utf8");
const storageRules = readFileSync(path.join(root, "storage.rules"), "utf8");

function block(source: string, start: string, next: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(next, from + start.length);
  assert.notEqual(from, -1, `${start} block must exist`);
  assert.notEqual(to, -1, `${next} boundary must exist`);
  return source.slice(from, to);
}

test("beauty brands and products are public-read/published and admin-write only", () => {
  for (const [start, next] of [
    ["match /beautyBrands/{brandId}", "match /beautyProducts/{productId}"],
    ["match /beautyProducts/{productId}", "match /beautyOrders/{orderId}"]
  ]) {
    const rules = block(firestoreRules, start, next);
    assert.match(rules, /allow get, list: if isActiveAdmin\(\) \|\| resource\.data\.isPublic == true;/);
    assert.match(rules, /allow create, update, delete: if isActiveAdmin\(\);/);
    assert.doesNotMatch(rules, /allow (?:create|update|delete)[^;]*if true/);
  }
});

test("beauty orders cannot be created, changed, or deleted by public clients", () => {
  const rules = block(
    firestoreRules,
    "match /beautyOrders/{orderId}",
    "match /beautySettlements/{settlementId}"
  );
  assert.match(rules, /allow get, list, update: if isActiveAdmin\(\);/);
  assert.match(rules, /allow create, delete: if false;/);
});

test("beauty media writes use the existing active administrator role", () => {
  const rules = block(
    storageRules,
    "match /beauty/{brandId}/{kind}/{fileName}",
    "match /casts/{castId}/video/{fileName}"
  );
  assert.match(rules, /allow read: if true;/);
  assert.match(rules, /allow create, update: if isActiveAdmin\(\)/);
  assert.match(rules, /allow delete: if isActiveAdmin\(\);/);
  assert.match(rules, /request\.resource\.contentType == "video\/mp4"/);
  assert.match(rules, /request\.resource\.size <= 30 \* 1024 \* 1024/);
});
