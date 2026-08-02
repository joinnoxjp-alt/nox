import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  cachedStoreCoverUrl,
  jobNeedsStoreCoverUpdate,
  STORE_COVER_SYNC_PAGE_SIZE,
  storeCoverChanged,
} from "../src/domain/storeCoverCache";

const storageUrl = (name: string): string =>
  `https://firebasestorage.googleapis.com/v0/b/noxapp-29171.firebasestorage.app/o/${name}?alt=media&token=test`;

test("detects cover replacement and deletion but ignores unrelated store updates", () => {
  const first = storageUrl("stores%2Fone%2Fcover%2Ffirst");
  const second = storageUrl("stores%2Fone%2Fcover%2Fsecond");
  assert.equal(storeCoverChanged({ coverImageUrl: first }, { coverImageUrl: second }), true);
  assert.equal(storeCoverChanged({ coverImageUrl: first }, { coverImageUrl: "" }), true);
  assert.equal(storeCoverChanged({ coverImageUrl: first }, { coverImageUrl: first, storeName: "Changed" }), false);
});

test("accepts only project Storage URLs for the public cache", () => {
  assert.equal(cachedStoreCoverUrl("https://tracking.example/cover.jpg"), "");
  assert.equal(cachedStoreCoverUrl(storageUrl("stores%2Fone%2Fcover%2Fvalid")), storageUrl("stores%2Fone%2Fcover%2Fvalid"));
});

test("updates only jobs whose dedicated store cover cache differs", () => {
  const cover = storageUrl("stores%2Fone%2Fcover%2Fvalid");
  assert.equal(jobNeedsStoreCoverUpdate({ imageUrls: ["job.jpg"] }, cover), true);
  assert.equal(jobNeedsStoreCoverUpdate({ storeCoverImageUrl: cover }, cover), false);
  assert.equal(jobNeedsStoreCoverUpdate({ storeCoverImageUrl: cover }, ""), true);
});

test("trigger uses bounded storeId pages, current-store checks, and audit records", () => {
  assert.equal(STORE_COVER_SYNC_PAGE_SIZE, 400);
  const source = readFileSync(
    path.resolve(__dirname, "../../src/triggers/syncStoreCoverToJobs.ts"),
    "utf8",
  );
  assert.match(source, /where\("storeId", "==", storeId\)/);
  assert.match(source, /limit\(STORE_COVER_SYNC_PAGE_SIZE\)/);
  assert.match(source, /jobsQuery\.startAfter\(cursor\)/);
  assert.match(source, /jobsSnapshot\.docs\.at\(-1\)\?\.id/);
  assert.match(source, /cursor = page\.lastId/);
  assert.match(source, /currentCover !== coverImageUrl/);
  assert.match(source, /jobNeedsStoreCoverUpdate/);
  assert.match(source, /existingAuditData\.status === "completed"/);
  assert.match(source, /existingAuditData\.lastProcessedJobId/);
  assert.match(source, /lastProcessedJobId: cursor/);
  assert.match(source, /status: "processing"/);
  assert.match(source, /storeCoverImageUrl: coverImageUrl/);
  assert.match(source, /adminAuditLogs/);
  assert.match(source, /timeoutSeconds: 120/);
  assert.match(source, /maxInstances: 2/);
  assert.match(source, /concurrency: 1/);
  assert.match(source, /retry: true/);
  assert.doesNotMatch(source, /imageUrls:/);
});

test("create, approval, and dashboard paths preserve job-specific images", () => {
  const createSource = readFileSync(path.resolve(__dirname, "../../src/callable/createAdminJob.ts"), "utf8");
  const approvalSource = readFileSync(path.resolve(__dirname, "../../src/callable/approveJobApplication.ts"), "utf8");
  const dashboardSource = readFileSync(path.resolve(__dirname, "../../../pages/store-dashboard.html"), "utf8");
  assert.match(createSource, /storeCoverImageUrl: cachedStoreCoverUrl\(store\.coverImageUrl\)/);
  assert.match(approvalSource, /storeCoverImageUrl:[\s\S]*cachedStoreCoverUrl/);
  assert.doesNotMatch(dashboardSource, /imageUrls: \[newUrl\]/);
});
