import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { firestore as defaultFirestore } from "../firebaseAdmin";
import { COIN_PLAY_COST, assertCoinWalletUsable, isCoinLotExpired, planCoinConsumption } from "./coin";
import { createAdminAuditLogDraft } from "../audit/adminAudit";
import { isAuthorizedOperatorTestPlayContext } from "./operatorTestPlay";
import type { OperatorTestPlayContext } from "./operatorTestPlay";
import { createSlotPlayId, SLOT_PROBABILITY_VERSION, TRIAL_PROBABILITY_NOTICE } from "./slotEngine";
import type { CoinLotSnapshot } from "../types/coin";
import type { NoxChanceStatus, SlotOutcome, SlotPlayResult } from "../types/slot";

const FREE_PLAY_LIMIT = 10;
const MAX_LOTS_PER_TRANSACTION = 400;

interface Dependencies { firestore?: Firestore; clock?: () => number }

function lotSnapshot(id: string, data: FirebaseFirestore.DocumentData): CoinLotSnapshot {
  return {
    id, uid: String(data.uid ?? ""), productId: data.productId,
    originalCoins: Number(data.originalCoins ?? 0),
    remainingCoins: Number(data.remainingCoins ?? 0),
    grantedAtMillis: data.grantedAt instanceof Timestamp ? data.grantedAt.toMillis() : Number.NaN,
    expiresAtMillis: data.expiresAt instanceof Timestamp ? data.expiresAt.toMillis() : Number.NaN,
    status: data.status,
  };
}

function storedResult(data: FirebaseFirestore.DocumentData): SlotPlayResult {
  return {
    playId: String(data.playId), requestId: String(data.requestId),
    playKind: data.playKind, profile: data.profile,
    probabilityVersion: String(data.probabilityVersion),
    resultCode: String(data.resultCode), reelStops: data.reelStops,
    coinsConsumed: Number(data.coinsConsumed), medalsAwarded: Number(data.medalsAwarded),
    freePlaysRemainingBefore: Number(data.freePlaysRemainingBefore),
    freePlaysRemainingAfter: Number(data.freePlaysRemainingAfter),
    medalBalanceBefore: Number(data.medalBalanceBefore),
    medalBalanceAfter: Number(data.medalBalanceAfter),
    probabilityNotice: data.probabilityNotice ?? null,
  };
}

export async function playMemberSlotTransaction(input: {
  uid: string; phoneIdentity: string; requestId: string;
  outcomes: { trial: SlotOutcome; standard: SlotOutcome };
}, dependencies: Dependencies = {}): Promise<SlotPlayResult> {
  const database = dependencies.firestore ?? defaultFirestore;
  const nowMillis = (dependencies.clock ?? Date.now)();
  const playId = createSlotPlayId(input.uid, input.requestId);
  const playRef = database.doc(`slotPlays/${playId}`);
  const stateRef = database.doc(`slotPlayerStates/${input.phoneIdentity}`);
  const identityRef = database.doc(`phoneIdentities/${input.phoneIdentity}`);
  const walletRef = database.doc(`coinWallets/${input.uid}`);
  const ledgerRef = database.doc(`coinLedger/${playId}`);
  const lotsQuery = database.collection("coinLots").where("uid", "==", input.uid)
    .limit(MAX_LOTS_PER_TRANSACTION + 1);

  return database.runTransaction(async (transaction) => {
    const [play, state, identity, wallet, lots] = await Promise.all([
      transaction.get(playRef), transaction.get(stateRef), transaction.get(identityRef),
      transaction.get(walletRef), transaction.get(lotsQuery),
    ]);
    if (play.exists) {
      const saved = storedResult(play.data() ?? {});
      if (saved.requestId !== input.requestId) throw new Error("slot-request-id-conflict");
      return saved;
    }
    if (!identity.exists || identity.data()?.uid !== input.uid || identity.data()?.status !== "active" ||
        !state.exists || state.data()?.uid !== input.uid || state.data()?.status !== "active") {
      throw new Error("slot-account-unavailable");
    }
    const consumed = Number(state.data()?.freePlaysConsumed ?? 0);
    const medalBefore = Number(state.data()?.medalBalance ?? 0);
    if (!Number.isSafeInteger(consumed) || consumed < 0 ||
        !Number.isSafeInteger(medalBefore) || medalBefore < 0) {
      throw new Error("invalid-slot-player-state");
    }
    const isFree = consumed < FREE_PLAY_LIMIT;
    const outcome = isFree ? input.outcomes.trial : input.outcomes.standard;
    assertCoinWalletUsable(wallet.data()?.status);
    let coinsConsumed = 0;
    let remainingCoinBalance = 0;
    let debits: ReturnType<typeof planCoinConsumption>["debits"] = [];
    if (!isFree) {
      if (lots.size > MAX_LOTS_PER_TRANSACTION) throw new Error("too-many-coin-lots");
      const plan = planCoinConsumption({
        uid: input.uid,
        lots: lots.docs.map((snapshot) => lotSnapshot(snapshot.id, snapshot.data())),
        nowMillis,
        billing: { kind: "member" },
      });
      coinsConsumed = plan.requestedCoins;
      remainingCoinBalance = plan.remainingUsableBalance;
      debits = plan.debits;
    }
    const beforeRemaining = Math.max(0, FREE_PLAY_LIMIT - consumed);
    const afterConsumed = isFree ? consumed + 1 : consumed;
    const medalAfter = medalBefore + outcome.medalsAwarded;
    const result: SlotPlayResult = {
      playId, requestId: input.requestId, playKind: isFree ? "free" : "paid",
      profile: isFree ? "trial" : "standard",
      probabilityVersion: SLOT_PROBABILITY_VERSION, ...outcome,
      coinsConsumed, freePlaysRemainingBefore: beforeRemaining,
      freePlaysRemainingAfter: Math.max(0, FREE_PLAY_LIMIT - afterConsumed),
      medalBalanceBefore: medalBefore, medalBalanceAfter: medalAfter,
      probabilityNotice: isFree ? TRIAL_PROBABILITY_NOTICE : null,
    };
    for (const debit of debits) {
      transaction.update(database.doc(`coinLots/${debit.lotId}`), {
        remainingCoins: debit.remainingCoinsAfter, updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (!isFree) {
      transaction.create(ledgerRef, {
        uid: input.uid, operationId: playId, requestId: input.requestId,
        type: "play_debit", coins: -COIN_PLAY_COST, debits,
        balanceAfter: remainingCoinBalance, createdAt: FieldValue.serverTimestamp(),
      });
      transaction.set(walletRef, {
        uid: input.uid, availableBalance: remainingCoinBalance,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    transaction.update(stateRef, {
      freePlaysConsumed: afterConsumed, medalBalance: medalAfter,
      paidPlaysConsumed: FieldValue.increment(isFree ? 0 : 1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(playRef, {
      uid: input.uid, ...result, createdAt: FieldValue.serverTimestamp(),
    });
    return result;
  });
}

export async function recordOperatorSlotPlay(input: {
  context: OperatorTestPlayContext; requestId: string; outcome: SlotOutcome;
}, dependencies: Dependencies = {}): Promise<SlotPlayResult> {
  if (!isAuthorizedOperatorTestPlayContext(input.context)) {
    throw new Error("unauthorized-operator-test-context");
  }
  const database = dependencies.firestore ?? defaultFirestore;
  const profile = input.context.probabilityProfile === "standard"
    ? "operator_standard" : "operator_high_probability_preview";
  const playId = createSlotPlayId(input.context.admin.uid, input.requestId);
  const auditRef = database.doc(`adminAuditLogs/${playId}`);
  const result: SlotPlayResult = {
    playId, requestId: input.requestId, playKind: "operator_test", profile,
    probabilityVersion: SLOT_PROBABILITY_VERSION, ...input.outcome,
    coinsConsumed: 0, freePlaysRemainingBefore: 10, freePlaysRemainingAfter: 10,
    medalBalanceBefore: 0, medalBalanceAfter: 0, probabilityNotice: null,
  };
  await database.runTransaction(async (transaction) => {
    const existing = await transaction.get(auditRef);
    if (existing.exists) {
      const saved = existing.data()?.after?.result as SlotPlayResult | undefined;
      if (!saved || saved.requestId !== input.requestId || saved.profile !== profile) {
        throw new Error("slot-request-id-conflict");
      }
      return;
    }
    transaction.create(auditRef, {
      ...createAdminAuditLogDraft(input.context.admin, {
        action: "nox_chance_operator_test_play", targetType: "nox_chance_operator_test",
        targetId: playId, after: { isOperatorTest: true, result },
      }),
    });
  });
  const saved = await auditRef.get();
  return (saved.data()?.after?.result as SlotPlayResult | undefined) ?? result;
}

export async function getMemberSlotStatus(input: {
  uid: string; phoneIdentity: string; smsVerified: boolean;
}, dependencies: Dependencies = {}): Promise<NoxChanceStatus> {
  const database = dependencies.firestore ?? defaultFirestore;
  const nowMillis = (dependencies.clock ?? Date.now)();
  const [state, identity, wallet, lots] = await Promise.all([
    database.doc(`slotPlayerStates/${input.phoneIdentity}`).get(),
    database.doc(`phoneIdentities/${input.phoneIdentity}`).get(),
    database.doc(`coinWallets/${input.uid}`).get(),
    database.collection("coinLots").where("uid", "==", input.uid)
      .limit(MAX_LOTS_PER_TRANSACTION + 1).get(),
  ]);
  if (!state.exists || state.data()?.uid !== input.uid || !identity.exists ||
      identity.data()?.uid !== input.uid || identity.data()?.status !== "active") {
    throw new Error("slot-account-unavailable");
  }
  if (lots.size > MAX_LOTS_PER_TRANSACTION) throw new Error("too-many-coin-lots");
  const consumed = Number(state.data()?.freePlaysConsumed ?? 0);
  const availableCoinBalance = lots.docs.map((item) => lotSnapshot(item.id, item.data()))
    .filter((lot) => lot.status === "active" && lot.uid === input.uid &&
      lot.remainingCoins > 0 && !isCoinLotExpired(lot, nowMillis))
    .reduce((sum, lot) => sum + lot.remainingCoins, 0);
  return {
    freePlaysRemaining: Math.max(0, FREE_PLAY_LIMIT - consumed),
    availableCoinBalance, medalBalance: Number(state.data()?.medalBalance ?? 0),
    accountFrozen: state.data()?.status !== "active" || wallet.data()?.status === "frozen",
    smsVerified: input.smsVerified,
    nextPlayKind: consumed < FREE_PLAY_LIMIT ? "free" : "paid",
    isOperatorTestAvailable: false,
  };
}
