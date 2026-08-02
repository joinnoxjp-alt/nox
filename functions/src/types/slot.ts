export type SlotProbabilityProfile =
  | "trial"
  | "standard"
  | "operator_standard"
  | "operator_high_probability_preview";

export type SlotPlayKind = "free" | "paid" | "operator_test";

export interface SlotOutcome {
  resultCode: string;
  reelStops: [string, string, string];
  medalsAwarded: number;
}

export interface SlotPlayResult extends SlotOutcome {
  playId: string;
  requestId: string;
  playKind: SlotPlayKind;
  profile: SlotProbabilityProfile;
  probabilityVersion: string;
  coinsConsumed: number;
  freePlaysRemainingBefore: number;
  freePlaysRemainingAfter: number;
  medalBalanceBefore: number;
  medalBalanceAfter: number;
  probabilityNotice: string | null;
}

export interface NoxChanceStatus {
  freePlaysRemaining: number;
  availableCoinBalance: number;
  medalBalance: number;
  accountFrozen: boolean;
  smsVerified: boolean;
  nextPlayKind: "free" | "paid" | "operator_test";
  isOperatorTestAvailable: boolean;
}
