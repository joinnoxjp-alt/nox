import assert from "node:assert/strict";
import test from "node:test";
import { formatReviewAuthor } from "../../pages/beauty-review-author.mjs";

const privateName = "佐藤 花子";
const cases = [
  ["表示名", { authorDisplayMode: "name", authorName: privateName }, privateName],
  ["イニシャル", { authorDisplayMode: "initials", authorName: privateName, authorInitials: "A.K" }, "A.K"],
  ["匿名", { authorDisplayMode: "anonymous", authorName: privateName }, "匿名"],
  ["20代", { authorDisplayMode: "age", authorName: privateName, ageGroup: "20s" }, "20代"],
  ["イニシャル＋30代", { authorDisplayMode: "initials_age", authorName: privateName, authorInitials: "A.K", ageGroup: "30s" }, "A.K / 30代"],
  ["匿名＋40代", { authorDisplayMode: "anonymous_age", authorName: privateName, ageGroup: "40s" }, "匿名 / 40代"],
  ["旧データ", { authorName: privateName }, privateName]
];

for (const [label, review, expected] of cases) test(label, () => {
  const rendered = formatReviewAuthor(review);
  assert.equal(rendered, expected);
  if (review.authorDisplayMode && review.authorDisplayMode !== "name") assert.equal(rendered.includes(privateName), false);
});

test("unknown privacy modes fail closed without exposing the management name", () => {
  assert.equal(formatReviewAuthor({ authorDisplayMode: "unexpected", authorName: privateName }), "匿名");
});
