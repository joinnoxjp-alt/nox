export type CoinProductId = "coins_60" | "coins_140" | "coins_500";
export type CoinLotStatus = "active" | "frozen" | "refunded" | "expired";
export type CoinWalletStatus = "active" | "frozen";
export type CoinLedgerType =
  | "purchase_credit"
  | "play_debit"
  | "expiration"
  | "refund"
  | "admin_adjustment";

export interface CoinProduct {
  id: CoinProductId;
  coins: number;
  amountJpy: number;
  validityDays: 180;
  currency: "JPY";
}

export interface CoinLotSnapshot {
  id: string;
  uid: string;
  productId: CoinProductId;
  originalCoins: number;
  remainingCoins: number;
  grantedAtMillis: number;
  expiresAtMillis: number;
  status: CoinLotStatus;
}

export interface CoinLotDebit {
  lotId: string;
  coins: number;
  remainingCoinsAfter: number;
}

export interface CoinConsumptionPlan {
  isOperatorTest: boolean;
  requestedCoins: number;
  debits: CoinLotDebit[];
  remainingUsableBalance: number;
}

export interface CoinOperationResult {
  operationId: string;
  requestId: string;
  uid: string;
  type: "grant" | "consume";
  coins: number;
  lotId?: string;
  debits?: CoinLotDebit[];
  isOperatorTest: boolean;
  productId?: CoinProductId;
  orderId?: string;
  checkoutSessionId?: string;
  paymentIntentId?: string;
}

export interface VerifiedPaymentGrant {
  source: "stripe_verified_webhook";
  uid: string;
  requestId: string;
  productId: CoinProductId;
  orderId: string;
  checkoutSessionId: string;
  paymentIntentId: string;
}
