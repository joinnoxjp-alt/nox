import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const admin = readFileSync(path.resolve(__dirname, "../../../pages/admin.html"), "utf8");

test("job lists start collapsed and expose accessible full-width toggles", () => {
  for (const [toggle, list] of [["jobApplicationToggle", "jobApplicationList"], ["publicJobToggle", "publicJobList"]]) {
    assert.match(admin, new RegExp(`id="${toggle}"[\\s\\S]*?aria-expanded="false"[\\s\\S]*?aria-controls="${list}"`));
    assert.match(admin, new RegExp(`id="${list}" hidden`));
  }
  assert.match(admin, /\.admin-collapse-toggle \{ width:100%/);
});

test("counts use the already loaded arrays without extra Firestore reads", () => {
  assert.match(admin, /updatePublicJobCollapse\(jobs\.length\)/);
  assert.match(admin, /updateJobApplicationCollapse\(pendingApplications\.length\)/);
  assert.match(admin, /publicJobHeadingCount\.textContent/);
  assert.match(admin, /jobApplicationHeadingCount\.textContent/);
});

test("collapse only changes hidden state and preserves rendered cards and listeners", () => {
  assert.match(admin, /content\.hidden = !expanded/);
  assert.match(admin, /publicJobList\.append\(card\)/);
  assert.match(admin, /jobApplicationList\.appendChild\(card\)/);
  assert.match(admin, /setApproveButtons\(\)/);
  assert.match(admin, /loadPublicJobs\(\)/);
  assert.match(admin, /NoxJobDuplicate\.find/);
});
