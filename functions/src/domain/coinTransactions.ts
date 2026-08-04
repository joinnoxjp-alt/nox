import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { firestore as defaultFirestore } from "../firebaseAdmin";
import {
  calculateCoinExpiryMillis,
  assertExternalPaymentId,
  assertCoinWalletUsable,
  assertPaymentClaimsAvailable,
  createCoinOperationId,
  createPaymentClaimId,
  getCoinProduct,
  isCoinLotExpired,
  planCoinConsumption,
  resolveIdempotentCoinOperation,
} from "./coin";
import type { CoinPlayBillingContext } from "./coin";
import type {
  CoinLotSnapshot,
  CoinOperationResult,
  CoinProductId,
  VerifiedPaymentGrant,
} from "../types/coin";

const MAX_LOTS_PER_TRANSACTION = 400;

interface CoinTransactionDependencies {
  firestore?: Firestore;
  clock?: () => number;
}

function operationResult(data: FirebaseFirestore.DocumentData | undefined):
CoinOperationResult | undefined {
  if (!data) return undefined;
  const result: CoinOperationResult = {
    operationId: String(data.operationId ?? ""),
    requestId: String(data.requestId ?? ""),
    uid: String(data.uid ?? ""),
    type: data.type === "grant" ? "grant" : "consume",
    coins: Number(data.coins ?? 0),
    isOperatorTest: data.isOperatorTest === true,
  };
  if (typeof data.lotId === "string") result.lotId = data.lotId;
  if (Array.isArray(data.debits)) result.debits = data.debits;
  if (["coins_60", "coins_140", "coins_500"].includes(data.productId)) {
    result.productId = data.productId as CoinProductId;
  }
  if (typeof data.orderId === "string") result.orderId = data.orderId;
  if (typeof data.checkoutSessionId === "string") {
    result.checkoutSessionId = data.checkoutSessionId;
  }
  if (typeof data.paymentIntentId === "string") {
    result.paymentIntentId = data.paymentIntentId;
  }
  return result;
}

function lotSnapshot(
  id: string,
  data: FirebaseFirestore.DocumentData,
): CoinLotSnapshot {
  return {
    id,
    uid: String(data.uid ?? ""),
    productId: data.productId as CoinProductId,
    originalCoins: Number(data.originalCoins ?? 0),
    remainingCoins: Number(data.remainingCoins ?? 0),
    grantedAtMillis: data.grantedAt instanceof Timestamp
      ? data.grantedAt.toMillis()
      : Number.NaN,
    expiresAtMillis: data.expiresAt instanceof Timestamp
      ? data.expiresAt.toMillis()
      : Number.NaN,
    status: data.status,
  };
}

export async function grantCoinLotFromVerifiedPaymentTransaction(
  payment: VerifiedPaymentGrant,
  dependencies: CoinTransactionDependencies = {},
): Promise<CoinOperationResult> {
  if (payment.source !== "stripe_verified_webhook") {
    throw new Error("unverified-coin-payment-source");
  }
  const database = dependencies.firestore ?? defaultFirestore;
  const product = getCoinProduct(payment.productId);
  const grantedAtMillis = (dependencies.clock ?? Date.now)();
  const operationId = createCoinOperationId(
    payment.uid,
    payment.requestId,
  );
  const orderId = assertExternalPaymentId(payment.orderId, "order");
  const checkoutSessionId = assertExternalPaymentId(
    payment.checkoutSessionId,
    "checkout-session",
  );
  const paymentIntentId = assertExternalPaymentId(
    payment.paymentIntentId,
    "payment-intent",
  );
  const expiresAtMillis = calculateCoinExpiryMillis(grantedAtMillis);
  const operationRef = database.doc(`coinOperations/${operationId}`);
  const lotRef = database.doc(`coinLots/${operationId}`);
  const ledgerRef = database.doc(`coinLedger/${operationId}`);
  const walletRef = database.doc(`coinWallets/${payment.uid}`);
  const claimRefs = [
    database.doc(`coinPaymentClaims/${createPaymentClaimId("order", orderId)}`),
    database.doc(`coinPaymentClaims/${createPaymentClaimId("checkout", checkoutSessionId)}`),
    database.doc(`coinPaymentClaims/${createPaymentClaimId("payment", paymentIntentId)}`),
  ];
  const lotsQuery = database.collection("coinLots")
    .where("uid", "==", payment.uid)
    .limit(MAX_LOTS_PER_TRANSACTION + 1);

  return database.runTransaction(async (transaction) => {
    const [operation, wallet, lots, ...claims] = await Promise.all([
      transaction.get(operationRef),
      transaction.get(walletRef),
      transaction.get(lotsQuery),
      ...claimRefs.map((reference) => transaction.get(reference)),
    ]);
    const replay = resolveIdempotentCoinOperation(
      operationResult(operation.data()),
      {
        uid: payment.uid,
        requestId: payment.requestId,
        type: "grant",
        productId: product.id,
        orderId,
        checkoutSessionId,
        paymentIntentId,
      },
    );
    if (replay) return replay;
    assertPaymentClaimsAvailable(claims.map((claim) => claim.exists));
    if (lots.size > MAX_LOTS_PER_TRANSACTION) {
      throw new Error("too-many-coin-lots");
    }
    assertCoinWalletUsable(wallet.data()?.status);

    const currentBalance = lots.docs
      .map((snapshot) => lotSnapshot(snapshot.id, snapshot.data()))
      .filter((lot) => lot.status === "active" &&
        lot.remainingCoins > 0 &&
        !isCoinLotExpired(lot, grantedAtMillis))
      .reduce((sum, lot) => sum + lot.remainingCoins, 0);
    const result: CoinOperationResult = {
      operationId,
      requestId: payment.requestId,
      uid: payment.uid,
      type: "grant",
      coins: product.coins,
      lotId: operationId,
      isOperatorTest: false,
      productId: product.id,
      orderId,
      checkoutSessionId,
      paymentIntentId,
    };
    transaction.create(lotRef, {
      uid: payment.uid,
      productId: product.id,
      originalCoins: product.coins,
      remainingCoins: product.coins,
      amountJpy: product.amountJpy,
      currency: product.currency,
      grantedAt: Timestamp.fromMillis(grantedAtMillis),
      expiresAt: Timestamp.fromMillis(expiresAtMillis),
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(ledgerRef, {
      uid: payment.uid,
      operationId,
      requestId: payment.requestId,
      type: "purchase_credit",
      coins: product.coins,
      lotId: operationId,
      productId: product.id,
      orderId,
      currency: product.currency,
      balanceAfter: currentBalance + product.coins,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.set(walletRef, {
      uid: payment.uid,
      status: "active",
      availableBalance: currentBalance + product.coins,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.create(operationRef, {
      ...result,
      createdAt: FieldValue.serverTimestamp(),
    });
    for (const claimRef of claimRefs) {
      transaction.create(claimRef, {
        operationId,
        orderId,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    return result;
  });
}

export async function consumeCoinForPlayTransaction(input: {
  uid: string;
  requestId: string;
  billing: CoinPlayBillingContext;
}, dependencies: CoinTransactionDependencies = {}): Promise<CoinOperationResult> {
  if (input.billing.kind === "operator_test") {
    const nowMillis = (dependencies.clock ?? Date.now)();
    const plan = planCoinConsumption({
      uid: input.uid,
      lots: [],
      nowMillis,
      billing: input.billing,
    });
    return {
      operationId: createCoinOperationId(input.uid, input.requestId),
      requestId: input.requestId,
      uid: input.uid,
      type: "consume",
      coins: plan.requestedCoins,
      debits: [],
      isOperatorTest: true,
    };
  }

  const database = dependencies.firestore ?? defaultFirestore;
  const nowMillis = (dependencies.clock ?? Date.now)();
  const operationId = createCoinOperationId(input.uid, input.requestId);
  const operationRef = database.doc(`coinOperations/${operationId}`);
  const ledgerRef = database.doc(`coinLedger/${operationId}`);
  const walletRef = database.doc(`coinWallets/${input.uid}`);
  const lotsQuery = database.collection("coinLots").where("uid", "==", input.uid)
    .limit(MAX_LOTS_PER_TRANSACTION + 1);

  return database.runTransaction(async (transaction) => {
    const [operation, wallet, lots] = await Promise.all([
      transaction.get(operationRef),
      transaction.get(walletRef),
      transaction.get(lotsQuery),
    ]);
    const replay = resolveIdempotentCoinOperation(
      operationResult(operation.data()),
      { uid: input.uid, requestId: input.requestId, type: "consume" },
    );
    if (replay) return replay;
    assertCoinWalletUsable(wallet.data()?.status);
    if (lots.size > MAX_LOTS_PER_TRANSACTION) throw new Error("too-many-coin-lots");

    const plan = planCoinConsumption({
      uid: input.uid,
      lots: lots.docs.map((snapshot) => lotSnapshot(snapshot.id, snapshot.data())),
      nowMillis,
      billing: input.billing,
    });
    for (const debit of plan.debits) {
      transaction.update(database.doc(`coinLots/${debit.lotId}`), {
        remainingCoins: debit.remainingCoinsAfter,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    const result: CoinOperationResult = {
      operationId,
      requestId: input.requestId,
      uid: input.uid,
      type: "consume",
      coins: plan.requestedCoins,
      debits: plan.debits,
      isOperatorTest: false,
    };
    transaction.create(ledgerRef, {
      uid: input.uid,
      operationId,
      requestId: input.requestId,
      type: "play_debit",
      coins: -plan.requestedCoins,
      debits: plan.debits,
      balanceAfter: plan.remainingUsableBalance,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.set(walletRef, {
      uid: input.uid,
      availableBalance: plan.remainingUsableBalance,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.create(operationRef, {
      ...result,
      createdAt: FieldValue.serverTimestamp(),
    });
    return result;
  });
}
