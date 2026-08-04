import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { classifyAdminStoreHistory, parseAdminStoreHistoryInput } from "../src/domain/adminStoreHistory";

test("classifies completed registration and issued invite history", () => {
  assert.equal(classifyAdminStoreHistory({ registrationStatus: "completed" }), "registration_completed");
  assert.equal(classifyAdminStoreHistory({ status: "approved", inviteId: "invite-1" }), "invite_issued");
  assert.equal(classifyAdminStoreHistory({ status: "pending" }), null);
});

test("accepts only an allowlisted type and safe history id", () => {
  assert.deepEqual(parseAdminStoreHistoryInput({ historyType: "registration_completed", historyId: "abc_DEF-123" }), { historyType: "registration_completed", historyId: "abc_DEF-123" });
  assert.throws(() => parseAdminStoreHistoryInput({ historyType: "store", historyId: "abc" }));
  assert.throws(() => parseAdminStoreHistoryInput({ historyType: "invite_issued", historyId: "../stores/x" }));
  assert.throws(() => parseAdminStoreHistoryInput({ historyType: "invite_issued", historyId: "abc", extra: true }));
});

test("callable authenticates first and only hides store application history", () => {
  const source = readFileSync(path.resolve(__dirname, "../../src/callable/deleteAdminStoreHistory.ts"), "utf8");
  assert.ok(source.indexOf("assertActiveAdmin") < source.indexOf("parseAdminStoreHistoryInput"));
  assert.match(source, /storeApplications\/\$\{input\.historyId\}/);
  assert.match(source, /adminHistoryHidden: true/);
  assert.match(source, /!snapshot\.exists/);
  assert.match(source, /alreadyRemoved: true/);
  assert.doesNotMatch(source, /transaction\.delete/);
  for (const collection of ["stores/", "jobs/", "storeContracts/", "users/", "storeInvites/"]) assert.doesNotMatch(source, new RegExp(collection));
});

test("admin page confirms, prevents duplicate clicks and refreshes visible history", () => {
  const source = readFileSync(path.resolve(__dirname, "../../../pages/admin.html"), "utf8");
  assert.match(source, /deleteAdminStoreHistoryCallable/);
  assert.match(source, /button\.disabled = true/);
  assert.match(source, /card\.remove\(\)/);
  assert.match(source, /adminHistoryHidden !== true/);
});
