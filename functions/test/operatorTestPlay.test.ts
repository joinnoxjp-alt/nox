import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createOperatorTestAuditDetails,
  createOperatorTestPolicy,
  OperatorTestPlayContext,
} from "../src/domain/operatorTestPlay";
import { isActiveAdminDocument } from "../src/security/adminAuthorization";

const ADMIN = {
  uid: "fixed-admin-uid",
  email: "admin@example.test",
};

function context(
  probabilityProfile: "standard" | "high_probability_preview" = "standard",
): OperatorTestPlayContext {
  return {
    admin: ADMIN,
    ...createOperatorTestPolicy({ probabilityProfile }),
  };
}

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
  assert.equal(context("standard").probabilityProfile, "standard");
  assert.equal(
    context("high_probability_preview").probabilityProfile,
    "high_probability_preview",
  );
  assert.throws(
    () => createOperatorTestPolicy({ probabilityProfile: "force_win" }),
    /invalid-operator-test-probability-profile/,
  );
});

test("operator tests never mutate member accounting or statistics", () => {
  const operatorContext = context();
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

test("creates bounded audit details separated from member plays", () => {
  const audit = createOperatorTestAuditDetails(
    context("high_probability_preview"),
    {
      requestId: "operator_test_0001",
      outcomeCode: "preview-medal-100",
    },
  );
  assert.equal(audit.action, "nox_chance_operator_test_play");
  assert.equal(audit.after.isOperatorTest, true);
  assert.equal(audit.after.consumeCoins, false);
  assert.equal(audit.after.consumeFreePlay, false);
  assert.equal(audit.after.persistMedalDelta, false);
});
