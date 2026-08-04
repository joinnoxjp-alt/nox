import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { playMemberSlotTransaction } from "../src/domain/slotTransactions";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("Slot transaction integration tests require Firestore Emulator.");
}
const app = initializeApp({ projectId: "demo-nox-local" }, "slot-integration");
const database = getFirestore(app);
const UID = "slot_member_uid";
const PHONE_IDENTITY = "a".repeat(64);
const NOW = Date.UTC(2026, 7, 3);
const outcomes = {
  trial: { resultCode: "trial", reelStops: ["A", "A", "A"] as [string, string, string], medalsAwarded: 50 },
  standard: { resultCode: "standard", reelStops: ["B", "B", "B"] as [string, string, string], medalsAwarded: 100 },
};

async function seed(freePlaysConsumed = 0, coins = 0, walletStatus = "active") {
  await database.doc(`phoneIdentities/${PHONE_IDENTITY}`).set({ uid: UID, status: "active" });
  await database.doc(`slotPlayerStates/${PHONE_IDENTITY}`).set({
    uid: UID, status: "active", freePlaysConsumed, paidPlaysConsumed: 0, medalBalance: 0,
  });
  await database.doc(`coinWallets/${UID}`).set({ uid: UID, status: walletStatus, availableBalance: coins });
  if (coins > 0) {
    await database.doc("coinLots/slot-lot").set({
      uid: UID, productId: "coins_60", originalCoins: coins, remainingCoins: coins,
      grantedAt: Timestamp.fromMillis(NOW - 1000),
      expiresAt: Timestamp.fromMillis(NOW + 100_000), status: "active",
    });
  }
}

beforeEach(async () => {
  for (const collection of [
    "phoneIdentities", "slotPlayerStates", "slotPlays", "coinWallets",
    "coinLots", "coinLedger", "adminAuditLogs",
  ]) {
    const snapshot = await database.collection(collection).get();
    await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
  }
});
after(async () => deleteApp(app));

test("lifetime plays one through ten are trial and the eleventh spends ten coins", async () => {
  await seed(0, 20);
  for (let index = 1; index <= 11; index += 1) {
    const result = await playMemberSlotTransaction({
      uid: UID, phoneIdentity: PHONE_IDENTITY,
      requestId: `slot_request_${String(index).padStart(4, "0")}`, outcomes,
    }, { firestore: database, clock: () => NOW });
    assert.equal(result.playKind, index <= 10 ? "free" : "paid");
    assert.equal(result.profile, index <= 10 ? "trial" : "standard");
  }
  assert.equal((await database.doc("coinLots/slot-lot").get()).data()?.remainingCoins, 10);
  assert.equal((await database.doc(`slotPlayerStates/${PHONE_IDENTITY}`).get()).data()?.freePlaysConsumed, 10);
});

test("concurrent tenth and eleventh plays serialize free usage and coin debit", async () => {
  await seed(9, 10);
  const results = await Promise.all([
    playMemberSlotTransaction({ uid: UID, phoneIdentity: PHONE_IDENTITY, requestId: "concurrent_001", outcomes }, { firestore: database, clock: () => NOW }),
    playMemberSlotTransaction({ uid: UID, phoneIdentity: PHONE_IDENTITY, requestId: "concurrent_002", outcomes }, { firestore: database, clock: () => NOW }),
  ]);
  assert.deepEqual(results.map((result) => result.playKind).sort(), ["free", "paid"]);
  assert.equal((await database.doc("coinLots/slot-lot").get()).data()?.remainingCoins, 0);
});

test("same request returns the persisted result without rerolling or double consuming", async () => {
  await seed(10, 20);
  const first = await playMemberSlotTransaction({
    uid: UID, phoneIdentity: PHONE_IDENTITY, requestId: "idempotent_001", outcomes,
  }, { firestore: database, clock: () => NOW });
  const replay = await playMemberSlotTransaction({
    uid: UID, phoneIdentity: PHONE_IDENTITY, requestId: "idempotent_001",
    outcomes: { ...outcomes, standard: { ...outcomes.standard, medalsAwarded: 5000 } },
  }, { firestore: database, clock: () => NOW });
  assert.deepEqual(replay, first);
  assert.equal((await database.doc("coinLots/slot-lot").get()).data()?.remainingCoins, 10);
  assert.equal((await database.collection("slotPlays").get()).size, 1);
});

test("insufficient and frozen accounts leave state, lots, ledger, and play history unchanged", async () => {
  await seed(10, 9);
  await assert.rejects(playMemberSlotTransaction({
    uid: UID, phoneIdentity: PHONE_IDENTITY, requestId: "insufficient_001", outcomes,
  }, { firestore: database, clock: () => NOW }), /insufficient-coin-balance/);
  await database.doc(`coinWallets/${UID}`).update({ status: "frozen" });
  await assert.rejects(playMemberSlotTransaction({
    uid: UID, phoneIdentity: PHONE_IDENTITY, requestId: "frozen_slot_001", outcomes,
  }, { firestore: database, clock: () => NOW }), /coin-wallet-frozen/);
  assert.equal((await database.doc("coinLots/slot-lot").get()).data()?.remainingCoins, 9);
  assert.equal((await database.collection("slotPlays").get()).size, 0);
  assert.equal((await database.collection("coinLedger").get()).size, 0);
});
