import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(__dirname, "../src/domain/coinTransactions.js"),
  "utf8",
);
const functionsIndex = readFileSync(
  resolve(__dirname, "../src/index.js"),
  "utf8",
);

test("grant and consume use Firestore transactions and deterministic operation IDs", () => {
  assert.equal((source.match(/runTransaction/g) ?? []).length, 2);
  assert.match(source, /createCoinOperationId/);
  assert.match(source, /resolveIdempotentCoinOperation/);
  assert.match(source, /transaction\.create\(operationRef/);
});

test("ledger and operation records are append-only creates", () => {
  assert.equal((source.match(/transaction\.create\(ledgerRef/g) ?? []).length, 2);
  assert.doesNotMatch(source, /transaction\.(?:set|update|delete)\(ledgerRef/);
  assert.doesNotMatch(source, /transaction\.(?:update|delete)\(operationRef/);
});

test("grant derives coin count, yen amount, and expiry from server definitions", () => {
  assert.match(source, /const product = .*getCoinProduct/);
  assert.match(source, /originalCoins: product\.coins/);
  assert.match(source, /amountJpy: product\.amountJpy/);
  assert.match(source, /calculateCoinExpiryMillis/);
  assert.match(source, /const grantedAtMillis = \(dependencies\.clock \?\? Date\.now\)\(\)/);
  assert.doesNotMatch(source, /input\.grantedAtMillis/);
});

test("consume reads lots before writes so concurrent transactions retry safely", () => {
  assert.match(source, /transaction\.get\(lotsQuery\)/);
  assert.match(source, /planCoinConsumption/);
  assert.match(source, /transaction\.update\(.*coinLots/s);
  assert.match(source, /assertCoinWalletUsable/);
  assert.match(source, /MAX_LOTS_PER_TRANSACTION = 400/);
});

test("operator tests return before opening a coin transaction", () => {
  const operatorBranch = source.indexOf('input.billing.kind === "operator_test"');
  const databaseAssignment = source.indexOf(
    "const database = dependencies.firestore",
    operatorBranch,
  );
  assert.ok(operatorBranch >= 0);
  assert.ok(databaseAssignment > operatorBranch);
  assert.match(source.slice(operatorBranch, databaseAssignment), /isOperatorTest: true/);
  assert.doesNotMatch(source.slice(operatorBranch, databaseAssignment), /runTransaction/);
});

test("verified payment IDs have independent append-only claims", () => {
  assert.match(source, /source !== "stripe_verified_webhook"/);
  assert.match(source, /coinPaymentClaims/);
  assert.match(source, /createPaymentClaimId\)\("order"/);
  assert.match(source, /createPaymentClaimId\)\("checkout"/);
  assert.match(source, /createPaymentClaimId\)\("payment"/);
  assert.match(source, /assertPaymentClaimsAvailable/);
});

test("coin grant and consume helpers are not exported as public Functions", () => {
  assert.doesNotMatch(functionsIndex, /grantCoin|consumeCoin|coinTransactions/);
});

test("coin foundation contains no monthly-present, phone, HMAC, card, signature, or logging data", () => {
  assert.doesNotMatch(source, /monthlyPresent|phoneNumber|phoneIdentity|HMAC|card|signature/i);
  assert.doesNotMatch(source, /console\.|logger\./);
});
