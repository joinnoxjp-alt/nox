import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { duplicateLockIds, findDuplicateJob, normalizeComparable } from "../src/domain/jobDuplicate";
import { readFileSync } from "node:fs";

const browserDuplicate = require(path.resolve(__dirname, "../../../pages/job-duplicate.js"));
const job = (id: string, storeName: string, area: string, extra = {}) => ({ id, storeName, area, status: "approved", ...extra });

test("normalizes width, case, spaces and reading aliases", () => {
  assert.equal(normalizeComparable("ＩＲＩＳ "), normalizeComparable("iris"));
  assert.equal(findDuplicateJob(job("new", "IRIS（アイリス）", "赤坂"), [job("old", "IRIS/アイリス", "赤坂")])?.level, "possible");
  assert.equal(browserDuplicate.find(job("new", "ＩＲＩＳ", "赤坂"), [job("old", "iris", "赤坂")]).job.id, "old");
});

test("blocks same store and area even when salary changes", () => {
  const match = findDuplicateJob({ ...job("new", "IRIS", "赤坂"), salary: "5000円" }, [{ ...job("old", "IRIS", "赤坂"), salary: "4000円" }]);
  assert.equal(match?.level, "possible");
});

test("allows same brand in different areas and distinct numbered branches", () => {
  assert.equal(findDuplicateJob(job("new", "二次元カノジョ", "新橋"), [job("old", "二次元カノジョ", "秋葉原")]), null);
  assert.equal(findDuplicateJob(job("new", "FABRIC 7", "六本木"), [job("old", "FABRIC本店", "六本木")]), null);
});

test("raises confidence for address and reports past jobs", () => {
  assert.equal(findDuplicateJob({ ...job("new", "IRIS", "赤坂"), address: "東京都港区1-2" }, [{ ...job("old", "IRIS", "赤坂"), address: "東京都港区1-2" }])?.level, "confirmed");
  assert.equal(findDuplicateJob(job("new", "IRIS", "赤坂"), [job("old", "IRIS", "赤坂", { status: "paused" })])?.level, "past");
});

test("lock IDs are deterministic for double-submit prevention", () => {
  assert.deepEqual(duplicateLockIds("ＩＲＩＳ/アイリス", " 赤坂 "), duplicateLockIds("IRIS（アイリス）", "赤坂"));
  assert.ok(duplicateLockIds("IRIS", "赤坂").length > 0);
});

test("server checks locked jobs before writing and can reuse deleted-job locks", () => {
  const source = readFileSync(path.resolve(__dirname, "../../src/callable/createAdminJob.ts"), "utf8");
  assert.match(source, /lockedJobs = await Promise\.all/);
  assert.match(source, /lockedJob\.exists/);
  assert.match(source, /transaction\.set\(lockRef/);
  assert.ok(source.indexOf("lockedJobs = await") < source.indexOf("transaction.set(lockRef"));
});
