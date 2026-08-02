import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import {
  consumeCoinForPlayTransaction,
  grantCoinLotFromVerifiedPaymentTransaction,
} from "../src/domain/coinTransactions";

const PROJECT_ID = "demo-nox-local";
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("Coin transaction integration tests require Firestore Emulator.");
}

const app = initializeApp({ projectId: PROJECT_ID }, "coin-transactions-integration");
const database = getFirestore(app);
const UID = "coin-transaction-member";
const NOW = Date.UTC(2026, 7, 2, 0, 0, 0);

beforeEach(async () => {
  const collections = ["coinWallets", "coinLots", "coinLedger", "coinOperations"];
  collections.push("coinPaymentClaims");
  for (const collection of collections) {
    const snapshots = await database.collection(collection).get();
    await Promise.all(snapshots.docs.map((snapshot) => snapshot.ref.delete()));
  }
});

after(async () => {
  await deleteApp(app);
});

test("duplicate grants create one lot and one ledger entry", async () => {
  const payment = {
      source: "stripe_verified_webhook" as const,
      uid: UID,
      requestId: "grant_request_0001",
      productId: "coins_60" as const,
      orderId: "order_000001",
      checkoutSessionId: "cs_test_000001",
      paymentIntentId: "pi_test_000001",
  };
  const [first, replay] = await Promise.all([
    grantCoinLotFromVerifiedPaymentTransaction(
      payment, { clock: () => NOW, firestore: database },
    ),
    grantCoinLotFromVerifiedPaymentTransaction(
      payment, { clock: () => NOW, firestore: database },
    ),
  ]);
  assert.deepEqual(replay, first);
  assert.equal((await database.collection("coinLots").get()).size, 1);
  assert.equal((await database.collection("coinLedger").get()).size, 1);
});

test("same payment cannot be granted again with a different request ID", async () => {
  const payment = {
    source: "stripe_verified_webhook" as const,
    uid: UID,
    requestId: "grant_request_0001",
    productId: "coins_60" as const,
    orderId: "order_000001",
    checkoutSessionId: "cs_test_000001",
    paymentIntentId: "pi_test_000001",
  };
  await grantCoinLotFromVerifiedPaymentTransaction(
    payment, { clock: () => NOW, firestore: database },
  );
  await assert.rejects(
    grantCoinLotFromVerifiedPaymentTransaction(
      { ...payment, requestId: "grant_request_0002" },
      { clock: () => NOW, firestore: database },
    ),
    /coin-payment-already-claimed/,
  );
  assert.equal((await database.collection("coinLots").get()).size, 1);
  assert.equal((await database.collection("coinLedger").get()).size, 1);
});

test("concurrent plays cannot spend the same ten coins twice", async () => {
  await database.doc("coinWallets/coin-transaction-member").set({
    uid: UID, status: "active", availableBalance: 10,
  });
  await database.doc("coinLots/only-lot").set({
    uid: UID,
    productId: "coins_60",
    originalCoins: 60,
    remainingCoins: 10,
    grantedAt: Timestamp.fromMillis(NOW - 1000),
    expiresAt: Timestamp.fromMillis(NOW + 100000),
    status: "active",
  });
  const results = await Promise.allSettled([
    consumeCoinForPlayTransaction({
      uid: UID,
      requestId: "play_request_0001",
      billing: { kind: "member" },
    }, { clock: () => NOW, firestore: database }),
    consumeCoinForPlayTransaction({
      uid: UID,
      requestId: "play_request_0002",
      billing: { kind: "member" },
    }, { clock: () => NOW, firestore: database }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal((await database.doc("coinLots/only-lot").get()).data()?.remainingCoins, 0);
  assert.equal((await database.collection("coinLedger").get()).size, 1);
});

test("frozen wallet and insufficient balance leave all records unchanged", async () => {
  await database.doc(`coinWallets/${UID}`).set({
    uid: UID, status: "frozen", availableBalance: 100,
  });
  await database.doc("coinLots/frozen-wallet-lot").set({
    uid: UID,
    productId: "coins_60",
    originalCoins: 60,
    remainingCoins: 60,
    grantedAt: Timestamp.fromMillis(NOW - 1000),
    expiresAt: Timestamp.fromMillis(NOW + 100000),
    status: "active",
  });
  await assert.rejects(consumeCoinForPlayTransaction({
    uid: UID,
    requestId: "frozen_play_0001",
    billing: { kind: "member" },
  }, { clock: () => NOW, firestore: database }), /coin-wallet-frozen/);
  assert.equal(
    (await database.doc("coinLots/frozen-wallet-lot").get()).data()?.remainingCoins,
    60,
  );
  assert.equal((await database.collection("coinLedger").get()).size, 0);
  assert.equal((await database.collection("coinOperations").get()).size, 0);

  await database.doc(`coinWallets/${UID}`).update({ status: "active" });
  await database.doc("coinLots/frozen-wallet-lot").update({ remainingCoins: 9 });
  await assert.rejects(consumeCoinForPlayTransaction({
    uid: UID,
    requestId: "insufficient_play_0001",
    billing: { kind: "member" },
  }, { clock: () => NOW, firestore: database }), /insufficient-coin-balance/);
  assert.equal(
    (await database.doc("coinLots/frozen-wallet-lot").get()).data()?.remainingCoins,
    9,
  );
  assert.equal((await database.collection("coinLedger").get()).size, 0);
  assert.equal((await database.collection("coinOperations").get()).size, 0);
});
