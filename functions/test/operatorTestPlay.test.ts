import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createOperatorTestAuditDetails,
  createOperatorTestPolicy,
} from "../src/domain/operatorTestPlay";
import type { OperatorTestPlayContext } from "../src/domain/operatorTestPlay";
import { isActiveAdminDocument } from "../src/security/adminAuthorization";

const ADMIN = {
  uid: "fixed-admin-uid",
  email: "admin@example.test",
};

test("the shared operator entry point always calls active-admin authorization", () => {
  const source = readFileSync(
    resolve(__dirname, "../src/domain/operatorTestPlay.js"),
    "utf8",
  );
  assert.match(source, /await \(0, adminAuthorization_1\.assertActiveAdmin\)\(auth\)/);
  assert.doesNotMatch(source, /authorize\s*=/);
});

test("general members, stores, and stopped administrators are not active admins", () => {
  assert.equal(isActiveAdminDocument({ role: "user", status: "active" }), false);
  assert.equal(isActiveAdminDocument({ role: "store", status: "active" }), false);
  assert.equal(isActiveAdminDocument({ role: "admin", status: "blocked" }), false);
  assert.equal(isActiveAdminDocument({ role: "admin", status: "stopped" }), false);
  assert.equal(isActiveAdminDocument({ role: "admin", status: "active" }), true);
});

test("does not trust client isAdmin or testMode fields", () => {
  assert.throws(
    () => createOperatorTestPolicy({ probabilityProfile: "standard", isAdmin: true }),
    /unknown-operator-test-input/,
  );
  assert.throws(
    () => createOperatorTestPolicy({ probabilityProfile: "standard", testMode: true }),
    /unknown-operator-test-input/,
  );
});

test("supports only standard and high-probability preview profiles", () => {
  assert.equal(
    createOperatorTestPolicy({ probabilityProfile: "standard" }).probabilityProfile,
    "standard",
  );
  assert.equal(
    createOperatorTestPolicy({ probabilityProfile: "high_probability_preview" })
      .probabilityProfile,
    "high_probability_preview",
  );
  assert.throws(
    () => createOperatorTestPolicy({ probabilityProfile: "force_win" }),
    /invalid-operator-test-probability-profile/,
  );
});

test("operator tests never mutate member accounting or statistics", () => {
  const operatorContext = createOperatorTestPolicy({ probabilityProfile: "standard" });
  assert.equal(operatorContext.isOperatorTest, true);
  assert.equal(operatorContext.unlimited, true);
  assert.deepEqual(operatorContext.accounting, {
    consumeFreePlay: false,
    consumeCoins: false,
    persistMedalDelta: false,
  });
  assert.deepEqual(
    Object.values(operatorContext.statistics),
    [false, false, false, false],
  );
});

test("rejects a structurally forged operator context", () => {
  const forged = {
    admin: ADMIN,
    ...createOperatorTestPolicy({ probabilityProfile: "standard" }),
  } as unknown as OperatorTestPlayContext;
  assert.throws(() => createOperatorTestAuditDetails(forged, {
    requestId: "operator_test_0001",
    outcomeCode: "preview-medal-100",
  }), /unauthorized-operator-test-context/);
});
