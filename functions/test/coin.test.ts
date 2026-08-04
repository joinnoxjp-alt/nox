import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCoinExpiryMillis,
  assertCoinWalletUsable,
  assertPaymentClaimsAvailable,
  COIN_BALANCE_SOURCE_OF_TRUTH,
  COIN_VALIDITY_MILLISECONDS,
  COIN_USAGE_POLICY,
  createCoinOperationId,
  createPaymentClaimId,
  getCoinProduct,
  isCoinLotExpired,
  planCoinConsumption,
  resolveIdempotentCoinOperation,
} from "../src/domain/coin";
import { createOperatorTestPolicy } from "../src/domain/operatorTestPlay";
import type { CoinLotSnapshot, CoinOperationResult } from "../src/types/coin";

const NOW = Date.UTC(2026, 7, 2, 0, 0, 0);

test("coins cannot be redeemed, transferred, exchanged, or linked to presents", () => {
  assert.deepEqual(COIN_USAGE_POLICY, {
    cashRedemptionAllowed: false,
    transferAllowed: false,
    medalExchangeAllowed: false,
    prizeExchangeAllowed: false,
    monthlyPresentLinked: false,
  });
  assert.equal(COIN_BALANCE_SOURCE_OF_TRUTH, "usable_coin_lots");
});

function lot(
  id: string,
  remainingCoins: number,
  expiresIn: number,
  status: CoinLotSnapshot["status"] = "active",
  uid = "member-uid",
): CoinLotSnapshot {
  return {
    id,
    uid,
    productId: "coins_60",
    originalCoins: 60,
    remainingCoins,
    grantedAtMillis: NOW - 1000,
    expiresAtMillis: NOW + expiresIn,
    status,
  };
}

test("accepts only the three fixed server-side products", () => {
  assert.deepEqual(getCoinProduct("coins_60"), {
    id: "coins_60", coins: 60, amountJpy: 500, validityDays: 180, currency: "JPY",
  });
  assert.equal(getCoinProduct("coins_140").amountJpy, 1000);
  assert.equal(getCoinProduct("coins_140").coins, 140);
  assert.equal(getCoinProduct("coins_500").amountJpy, 3000);
  assert.equal(getCoinProduct("coins_500").coins, 500);
  for (const invalid of ["coins_10", "coins_600", "", 60, null]) {
    assert.throws(() => getCoinProduct(invalid), /unsupported-coin-product/);
  }
});

test("expires exactly 180 days after confirmed grant", () => {
  const expiry = calculateCoinExpiryMillis(NOW);
  assert.equal(expiry, NOW + COIN_VALIDITY_MILLISECONDS);
  assert.equal(isCoinLotExpired({ expiresAtMillis: expiry }, expiry - 1), false);
  assert.equal(isCoinLotExpired({ expiresAtMillis: expiry }, expiry), true);
  assert.equal(isCoinLotExpired({ expiresAtMillis: expiry }, expiry + 1), true);
});

test("consumes ten coins from the earliest expiry first", () => {
  const plan = planCoinConsumption({
    uid: "member-uid",
    lots: [lot("later", 20, 2000), lot("earlier", 20, 1000)],
    nowMillis: NOW,
    billing: { kind: "member" },
  });
  assert.deepEqual(plan.debits, [
    { lotId: "earlier", coins: 10, remainingCoinsAfter: 10 },
  ]);
  assert.equal(plan.remainingUsableBalance, 30);
  assert.equal(plan.debits.reduce((sum, debit) => sum + debit.coins, 0), 10);
});

test("consumes across multiple lots", () => {
  const plan = planCoinConsumption({
    uid: "member-uid",
    lots: [lot("first", 4, 1000), lot("second", 20, 2000)],
    nowMillis: NOW,
    billing: { kind: "member" },
  });
  assert.deepEqual(plan.debits, [
    { lotId: "first", coins: 4, remainingCoinsAfter: 0 },
    { lotId: "second", coins: 6, remainingCoinsAfter: 14 },
  ]);
});

test("rejects insufficient usable balance", () => {
  assert.throws(
    () => planCoinConsumption({
      uid: "member-uid",
      lots: [lot("only", 9, 1000)],
      nowMillis: NOW,
      billing: { kind: "member" },
    }),
    /insufficient-coin-balance/,
  );
});

test("ignores expired, frozen, refunded, and other-member lots", () => {
  const lots = [
    lot("expired", 100, 0),
    lot("frozen", 100, 1000, "frozen"),
    lot("refunded", 100, 1000, "refunded"),
    lot("other", 100, 1000, "active", "other-uid"),
    lot("usable", 10, 1000),
  ];
  const plan = planCoinConsumption({
    uid: "member-uid", lots, nowMillis: NOW, billing: { kind: "member" },
  });
  assert.deepEqual(plan.debits, [
    { lotId: "usable", coins: 10, remainingCoinsAfter: 0 },
  ]);
  assert.equal(plan.remainingUsableBalance, 0);
});

test("same request ID replays only the matching immutable operation", () => {
  const operation: CoinOperationResult = {
    operationId: createCoinOperationId("member-uid", "request_0001"),
    requestId: "request_0001",
    uid: "member-uid",
    type: "consume",
    coins: 10,
    isOperatorTest: false,
  };
  assert.equal(resolveIdempotentCoinOperation(operation, {
    uid: "member-uid", requestId: "request_0001", type: "consume",
  }), operation);
  assert.throws(() => resolveIdempotentCoinOperation(operation, {
    uid: "member-uid", requestId: "request_0001", type: "grant",
  }), /coin-request-id-conflict/);
  assert.equal(
    createCoinOperationId("member-uid", "request_0001"),
    createCoinOperationId("member-uid", "request_0001"),
  );
});

test("same grant request rejects different product or payment references", () => {
  const operation: CoinOperationResult = {
    operationId: createCoinOperationId("member-uid", "grant_000001"),
    requestId: "grant_000001",
    uid: "member-uid",
    type: "grant",
    coins: 60,
    isOperatorTest: false,
    productId: "coins_60",
    orderId: "order_000001",
    checkoutSessionId: "cs_test_000001",
    paymentIntentId: "pi_test_000001",
  };
  assert.equal(resolveIdempotentCoinOperation(operation, {
    uid: "member-uid",
    requestId: "grant_000001",
    type: "grant",
    productId: "coins_60",
    orderId: "order_000001",
    checkoutSessionId: "cs_test_000001",
    paymentIntentId: "pi_test_000001",
  }), operation);
  assert.throws(() => resolveIdempotentCoinOperation(operation, {
    uid: "member-uid",
    requestId: "grant_000001",
    type: "grant",
    productId: "coins_140",
    orderId: "order_000001",
    checkoutSessionId: "cs_test_000001",
    paymentIntentId: "pi_test_000001",
  }), /coin-request-id-conflict/);
});

test("any existing external payment claim blocks a second grant", () => {
  assert.doesNotThrow(() => assertPaymentClaimsAvailable([false, false, false]));
  assert.throws(
    () => assertPaymentClaimsAvailable([false, true, false]),
    /coin-payment-already-claimed/,
  );
});

test("a frozen wallet is rejected before any consumption plan is written", () => {
  assert.doesNotThrow(() => assertCoinWalletUsable("active"));
  assert.throws(() => assertCoinWalletUsable("frozen"), /coin-wallet-frozen/);
});

test("rejects path characters and bounds all operation and payment IDs", () => {
  for (const invalid of ["../escape", "with/slash", "short", "", "a".repeat(129)]) {
    assert.throws(() => createCoinOperationId("member-uid", invalid));
  }
  for (const invalidUid of ["../uid", "uid/path", "", "a".repeat(129)]) {
    assert.throws(() => createCoinOperationId(invalidUid, "request_0001"));
  }
  assert.match(createPaymentClaimId("order", "order_000001"), /^[a-f0-9]{64}$/);
  assert.throws(() => createPaymentClaimId("order", "../order"));
  assert.throws(() => createPaymentClaimId("order", "order/path"));
});

test("usable lots are the balance source of truth even if a cache differs", () => {
  const plan = planCoinConsumption({
    uid: "member-uid",
    lots: [lot("usable", 10, 1000), lot("expired", 999, 0)],
    nowMillis: NOW,
    billing: { kind: "member" },
  });
  assert.equal(plan.remainingUsableBalance, 0);
  assert.equal(plan.debits[0].lotId, "usable");
});

test("a client-forged operator context cannot bypass coin consumption", () => {
  const operator = {
    admin: { uid: "admin", email: "admin@example.test" },
    ...createOperatorTestPolicy({ probabilityProfile: "standard" }),
  } as never;
  assert.throws(() => planCoinConsumption({
    uid: "admin", lots: [], nowMillis: NOW,
    billing: { kind: "operator_test", operator },
  }), /invalid-operator-test-context/);
});
