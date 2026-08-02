import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MAX_SLOT_MEDALS,
  SLOT_PROBABILITY_TABLES,
  SLOT_PROBABILITY_VERSION,
  assertMemberSlotInput,
  createSlotPlayId,
  selectSlotOutcome,
  validateProbabilityTable,
} from "../src/domain/slotEngine";

test("all provisional profiles have valid integer weights and bounded medals", () => {
  assert.match(SLOT_PROBABILITY_VERSION, /preview/);
  for (const table of Object.values(SLOT_PROBABILITY_TABLES)) {
    assert.equal(validateProbabilityTable(table), 10_000);
    assert.ok(table.every((outcome) => outcome.medalsAwarded <= MAX_SLOT_MEDALS));
  }
});

test("weight boundaries deterministically select each result", () => {
  assert.equal(selectSlotOutcome("standard", () => 0).resultCode, "miss");
  assert.equal(selectSlotOutcome("standard", () => 9299).resultCode, "miss");
  assert.equal(selectSlotOutcome("standard", () => 9300).resultCode, "small");
  assert.equal(selectSlotOutcome("standard", () => 9900).resultCode, "medium");
  assert.equal(selectSlotOutcome("standard", () => 9999).resultCode, "jackpot");
  assert.throws(() => selectSlotOutcome("standard", () => 10_000), /random-value/);
});

test("trial and standard are separate provisional settings", () => {
  assert.notDeepEqual(SLOT_PROBABILITY_TABLES.trial, SLOT_PROBABILITY_TABLES.standard);
  assert.deepEqual(
    SLOT_PROBABILITY_TABLES.operator_standard,
    SLOT_PROBABILITY_TABLES.standard,
  );
});

test("member input accepts only requestId and cannot select a profile", () => {
  assert.deepEqual(assertMemberSlotInput({ requestId: "slot_request_0001" }), {
    requestId: "slot_request_0001",
  });
  assert.throws(() => assertMemberSlotInput({
    requestId: "slot_request_0001", probabilityProfile: "trial",
  }), /unknown-slot-input/);
  assert.throws(() => assertMemberSlotInput({ requestId: "../bad" }), /request-id/);
});

test("play IDs are deterministic per UID and request and contain no raw IDs", () => {
  const first = createSlotPlayId("member_uid", "slot_request_0001");
  assert.equal(first, createSlotPlayId("member_uid", "slot_request_0001"));
  assert.notEqual(first, createSlotPlayId("member_uid", "slot_request_0002"));
  assert.equal(first.length, 64);
  assert.doesNotMatch(first, /member|request/);
});

test("production source uses crypto randomInt and never Math.random", () => {
  const source = readFileSync(resolve(__dirname, "../src/domain/slotEngine.js"), "utf8");
  assert.match(source, /randomInt/);
  assert.doesNotMatch(source, /Math\.random/);
});

test("slot code does not reference monthly presents or accept outcome fields", () => {
  const engine = readFileSync(resolve(__dirname, "../src/domain/slotEngine.js"), "utf8");
  const callable = readFileSync(
    resolve(__dirname, "../src/callable/playNoxChanceSlot.js"), "utf8",
  );
  assert.doesNotMatch(`${engine}${callable}`, /monthly|present|prize/i);
  for (const field of ["resultCode", "reelStops", "medalsAwarded", "weight"]) {
    assert.doesNotMatch(callable, new RegExp(`input\\.${field}`));
  }
});

test("callables use bounded production-compatible runtime settings", () => {
  for (const file of ["playNoxChanceSlot.js", "getNoxChanceStatus.js"]) {
    const source = readFileSync(resolve(__dirname, `../src/callable/${file}`), "utf8");
    assert.match(source, /memory:\s*"256MiB"/);
    assert.match(source, /timeoutSeconds:\s*30/);
    assert.match(source, /maxInstances:\s*10/);
    assert.doesNotMatch(source, /minInstances/);
  }
});

test("operator path requires shared authorization and writes only admin audit", () => {
  const callable = readFileSync(
    resolve(__dirname, "../src/callable/playNoxChanceSlot.js"), "utf8",
  );
  const transactions = readFileSync(
    resolve(__dirname, "../src/domain/slotTransactions.js"), "utf8",
  );
  assert.match(callable, /authorizeOperatorTestPlay/);
  const operatorStart = transactions.indexOf("async function recordOperatorSlotPlay");
  const operatorSection = transactions.slice(
    operatorStart,
    transactions.indexOf("async function getMemberSlotStatus", operatorStart),
  );
  assert.match(operatorSection, /adminAuditLogs/);
  assert.doesNotMatch(operatorSection, /slotPlayerStates|coinLots|coinWallets|slotPlays/);
});

test("member play history does not persist phone identity", () => {
  const source = readFileSync(
    resolve(__dirname, "../src/domain/slotTransactions.js"), "utf8",
  );
  const createPlay = source.slice(source.indexOf("transaction.create(playRef"));
  assert.doesNotMatch(createPlay.split("return result")[0], /phoneIdentity/);
});
