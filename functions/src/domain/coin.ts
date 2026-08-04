import { createHash } from "node:crypto";
import {
  isAuthorizedOperatorTestPlayContext,
} from "./operatorTestPlay";
import type { OperatorTestPlayContext } from "./operatorTestPlay";
import type {
  CoinConsumptionPlan,
  CoinLotSnapshot,
  CoinOperationResult,
  CoinProduct,
  CoinProductId,
} from "../types/coin";

export const COIN_PLAY_COST = 10;
export const COIN_VALIDITY_DAYS = 180;
export const COIN_VALIDITY_MILLISECONDS =
  COIN_VALIDITY_DAYS * 24 * 60 * 60 * 1000;
export const COIN_USAGE_POLICY = Object.freeze({
  cashRedemptionAllowed: false,
  transferAllowed: false,
  medalExchangeAllowed: false,
  prizeExchangeAllowed: false,
  monthlyPresentLinked: false,
});
export const COIN_BALANCE_SOURCE_OF_TRUTH = "usable_coin_lots" as const;

const PRODUCTS: Readonly<Record<CoinProductId, Readonly<CoinProduct>>> =
  Object.freeze({
    coins_60: Object.freeze({
      id: "coins_60", coins: 60, amountJpy: 500, validityDays: 180, currency: "JPY",
    }),
    coins_140: Object.freeze({
      id: "coins_140", coins: 140, amountJpy: 1000, validityDays: 180, currency: "JPY",
    }),
    coins_500: Object.freeze({
      id: "coins_500", coins: 500, amountJpy: 3000, validityDays: 180, currency: "JPY",
    }),
  });

export function getCoinProduct(productId: unknown): Readonly<CoinProduct> {
  if (typeof productId !== "string" || !(productId in PRODUCTS)) {
    throw new Error("unsupported-coin-product");
  }
  return PRODUCTS[productId as CoinProductId];
}

export function calculateCoinExpiryMillis(grantedAtMillis: number): number {
  if (!Number.isSafeInteger(grantedAtMillis) || grantedAtMillis < 0) {
    throw new Error("invalid-coin-grant-time");
  }
  return grantedAtMillis + COIN_VALIDITY_MILLISECONDS;
}

export function isCoinLotExpired(
  lot: Pick<CoinLotSnapshot, "expiresAtMillis">,
  nowMillis: number,
): boolean {
  return nowMillis >= lot.expiresAtMillis;
}

function isUsableLot(lot: CoinLotSnapshot, uid: string, nowMillis: number): boolean {
  return lot.uid === uid &&
    lot.status === "active" &&
    lot.remainingCoins > 0 &&
    !isCoinLotExpired(lot, nowMillis);
}

export function assertCoinRequestId(requestId: unknown): string {
  if (typeof requestId !== "string" ||
      !/^[A-Za-z0-9_-]{8,128}$/.test(requestId)) {
    throw new Error("invalid-coin-request-id");
  }
  return requestId;
}

export function createCoinOperationId(uid: string, requestId: unknown): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
    throw new Error("invalid-coin-user-id");
  }
  return createHash("sha256")
    .update(`${uid}:${assertCoinRequestId(requestId)}`, "utf8")
    .digest("hex");
}

export type CoinPlayBillingContext =
  | { kind: "member" }
  | { kind: "operator_test"; operator: OperatorTestPlayContext };

export function planCoinConsumption(input: {
  uid: string;
  lots: readonly CoinLotSnapshot[];
  nowMillis: number;
  billing: CoinPlayBillingContext;
  cost?: number;
}): CoinConsumptionPlan {
  const cost = input.cost ?? COIN_PLAY_COST;
  if (!Number.isSafeInteger(cost) || cost <= 0) {
    throw new Error("invalid-coin-consumption");
  }
  if (input.billing.kind === "operator_test") {
    if (!isAuthorizedOperatorTestPlayContext(input.billing.operator) ||
        !input.billing.operator.isOperatorTest ||
        input.billing.operator.accounting.consumeCoins !== false) {
      throw new Error("invalid-operator-test-context");
    }
    return {
      isOperatorTest: true,
      requestedCoins: 0,
      debits: [],
      remainingUsableBalance: input.lots
        .filter((lot) => isUsableLot(lot, input.uid, input.nowMillis))
        .reduce((sum, lot) => sum + lot.remainingCoins, 0),
    };
  }

  const usable = input.lots
    .filter((lot) => isUsableLot(lot, input.uid, input.nowMillis))
    .sort((left, right) =>
      left.expiresAtMillis - right.expiresAtMillis ||
      left.grantedAtMillis - right.grantedAtMillis ||
      left.id.localeCompare(right.id));
  const balance = usable.reduce((sum, lot) => sum + lot.remainingCoins, 0);
  if (balance < cost) throw new Error("insufficient-coin-balance");

  let outstanding = cost;
  const debits = [];
  for (const lot of usable) {
    if (outstanding === 0) break;
    const coins = Math.min(outstanding, lot.remainingCoins);
    debits.push({
      lotId: lot.id,
      coins,
      remainingCoinsAfter: lot.remainingCoins - coins,
    });
    outstanding -= coins;
  }
  return {
    isOperatorTest: false,
    requestedCoins: cost,
    debits,
    remainingUsableBalance: balance - cost,
  };
}

export function resolveIdempotentCoinOperation(
  existing: CoinOperationResult | undefined,
  expected: {
    uid: string;
    requestId: string;
    type: "grant" | "consume";
    productId?: CoinProductId;
    orderId?: string;
    checkoutSessionId?: string;
    paymentIntentId?: string;
  },
): CoinOperationResult | undefined {
  if (!existing) return undefined;
  if (existing.uid !== expected.uid ||
      existing.requestId !== expected.requestId ||
      existing.type !== expected.type ||
      existing.productId !== expected.productId ||
      existing.orderId !== expected.orderId ||
      existing.checkoutSessionId !== expected.checkoutSessionId ||
      existing.paymentIntentId !== expected.paymentIntentId) {
    throw new Error("coin-request-id-conflict");
  }
  return existing;
}

export function assertExternalPaymentId(value: unknown, kind: string): string {
  if (typeof value !== "string" ||
      !/^[A-Za-z0-9_-]{8,255}$/.test(value)) {
    throw new Error(`invalid-${kind}-id`);
  }
  return value;
}

export function createPaymentClaimId(kind: string, value: unknown): string {
  const identifier = assertExternalPaymentId(value, kind);
  return createHash("sha256").update(`${kind}:${identifier}`, "utf8").digest("hex");
}

export function assertPaymentClaimsAvailable(claimsExist: readonly boolean[]): void {
  if (claimsExist.some(Boolean)) throw new Error("coin-payment-already-claimed");
}

export function assertCoinWalletUsable(status: unknown): void {
  if (status === "frozen") throw new Error("coin-wallet-frozen");
}
