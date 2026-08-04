import assert from "node:assert/strict";
import test from "node:test";
import type { UserRecord } from "firebase-admin/auth";
import { authorizeSlotMember } from "../src/security/slotMemberAuthorization";

const SECRET = "s".repeat(32);
function authUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    uid: "member_uid", disabled: false, emailVerified: true,
    phoneNumber: "+819012345678", ...overrides,
  } as UserRecord;
}

test("active email- and SMS-verified general member is authorized", () => {
  const result = authorizeSlotMember({
    authUser: authUser(),
    userData: { role: "user", status: "active", phoneVerified: true },
    hmacSecret: SECRET,
  });
  assert.equal(result.uid, "member_uid");
  assert.equal(result.smsVerified, true);
  assert.equal(result.phoneIdentity.length, 64);
  assert.doesNotMatch(result.phoneIdentity, /09012345678/);
});

for (const [name, user, data] of [
  ["SMS unverified", authUser({ phoneNumber: undefined }), { role: "user", status: "active", phoneVerified: false }],
  ["email unverified", authUser({ emailVerified: false }), { role: "user", status: "active", phoneVerified: true }],
  ["store", authUser(), { role: "store", status: "active", phoneVerified: true }],
  ["stopped member", authUser(), { role: "user", status: "stopped", phoneVerified: true }],
  ["disabled member", authUser({ disabled: true }), { role: "user", status: "active", phoneVerified: true }],
] as const) {
  test(`${name} is rejected`, () => {
    assert.throws(() => authorizeSlotMember({
      authUser: user, userData: data, hmacSecret: SECRET,
    }), /slot-member-ineligible/);
  });
}
