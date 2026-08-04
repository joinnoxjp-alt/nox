import assert from "node:assert/strict";
import test from "node:test";
import {
  assertE164PhoneNumber,
  assertEligiblePhoneIdentityUser,
  assertEmptyPhoneIdentityInput,
  assertPhoneIdentityAvailable,
  createDeletedAccountSafeguard,
  createPhoneIdentity,
  maskPhoneNumber,
} from "../src/domain/phoneIdentity";

const SECRET = "test-only-secret-with-at-least-32-bytes";

test("callable accepts no client fields", () => {
  assert.doesNotThrow(() => assertEmptyPhoneIdentityInput(undefined));
  assert.doesNotThrow(() => assertEmptyPhoneIdentityInput({}));
  assert.throws(() => assertEmptyPhoneIdentityInput({ phone: "+819012345678" }));
  assert.throws(() => assertEmptyPhoneIdentityInput([]));
});

test("only email-verified pending or active members are eligible", () => {
  assert.doesNotThrow(() => assertEligiblePhoneIdentityUser(true, "user", "pending"));
  assert.doesNotThrow(() => assertEligiblePhoneIdentityUser(true, "user", "active"));
  assert.throws(() => assertEligiblePhoneIdentityUser(false, "user", "active"));
  assert.throws(() => assertEligiblePhoneIdentityUser(true, "admin", "active"));
  assert.throws(() => assertEligiblePhoneIdentityUser(true, "store", "active"));
  assert.throws(() => assertEligiblePhoneIdentityUser(true, "user", "blocked"));
  assert.throws(() => assertEligiblePhoneIdentityUser(true, "user", "stopped"));
});

test("creates a stable HMAC for a canonical E.164 number", () => {
  const first = createPhoneIdentity("+819012345678", SECRET);
  const second = createPhoneIdentity(" +819012345678 ", SECRET);
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first.includes("819012345678"), false);
});

test("deletion safeguard retains only anti-abuse state", () => {
  const safeguard = createDeletedAccountSafeguard(
    { freePlaysConsumed: 7, uid: "must-not-copy", medalBalance: 50 },
    { monthlyEntryMonths: ["2026-07", "invalid"], fraudStatus: "review" },
  );
  assert.deepEqual(safeguard, {
    freePlaysConsumed: 7,
    monthlyEntryMonths: ["2026-07"],
    fraudStatus: "review",
  });
  assert.equal(JSON.stringify(safeguard).includes("must-not-copy"), false);
});

test("deletion trigger retries retain previous monthly and fraud safeguards", () => {
  const first = createDeletedAccountSafeguard(
    { freePlaysConsumed: 4 },
    { monthlyEntryMonths: ["2026-08"], fraudStatus: "review" },
  );
  const retry = createDeletedAccountSafeguard(
    { freePlaysConsumed: first.freePlaysConsumed },
    first,
  );
  assert.deepEqual(retry, first);
});

test("a deleted identity remains unavailable to a re-registered UID", () => {
  assert.throws(
    () => assertPhoneIdentityAvailable(undefined, "new-uid", "deleted"),
    /already-used/,
  );
});

test("rejects non-E.164 input instead of guessing on the server", () => {
  assert.throws(() => assertE164PhoneNumber("090-1234-5678"), /invalid-e164/);
  assert.throws(() => createPhoneIdentity("+0123", SECRET), /invalid-e164/);
});

test("requires an injected secret of sufficient length", () => {
  assert.throws(
    () => createPhoneIdentity("+819012345678", "short"),
    /secret-too-short/,
  );
});

test("masks the number without exposing the complete value", () => {
  const masked = maskPhoneNumber("+819012345678");
  assert.equal(masked, "+81******5678");
  assert.equal(masked.includes("901234"), false);
});

test("same UID retries are idempotent and another UID is rejected", () => {
  assert.doesNotThrow(() => assertPhoneIdentityAvailable(undefined, "uid-a"));
  assert.doesNotThrow(() => assertPhoneIdentityAvailable("uid-a", "uid-a"));
  assert.throws(
    () => assertPhoneIdentityAvailable("uid-a", "uid-b"),
    /already-used/,
  );
});
