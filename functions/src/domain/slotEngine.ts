import { createHash, randomInt } from "node:crypto";
import { assertCoinRequestId } from "./coin";
import type {
  SlotOutcome,
  SlotProbabilityProfile,
} from "../types/slot";

export const SLOT_PROBABILITY_VERSION = "nox-chance-preview-v1";
export const TRIAL_PROBABILITY_NOTICE =
  "体験モードは通常プレイと確率が異なります";
export const MAX_SLOT_MEDALS = 5_000;

interface WeightedOutcome extends SlotOutcome {
  weight: number;
}

const reels = (left: string, center: string, right: string): [string, string, string] =>
  [left, center, right];

// 暫定値。公開前に運営承認を受け、バージョンを更新する。
export const SLOT_PROBABILITY_TABLES = Object.freeze({
  trial: Object.freeze([
    { resultCode: "miss", reelStops: reels("BAR", "7", "STAR"), medalsAwarded: 0, weight: 6500 },
    { resultCode: "small", reelStops: reels("CHERRY", "CHERRY", "CHERRY"), medalsAwarded: 50, weight: 2500 },
    { resultCode: "medium", reelStops: reels("STAR", "STAR", "STAR"), medalsAwarded: 300, weight: 900 },
    { resultCode: "jackpot", reelStops: reels("7", "7", "7"), medalsAwarded: 5000, weight: 100 },
  ]),
  standard: Object.freeze([
    { resultCode: "miss", reelStops: reels("BAR", "7", "STAR"), medalsAwarded: 0, weight: 9300 },
    { resultCode: "small", reelStops: reels("CHERRY", "CHERRY", "CHERRY"), medalsAwarded: 50, weight: 600 },
    { resultCode: "medium", reelStops: reels("STAR", "STAR", "STAR"), medalsAwarded: 300, weight: 95 },
    { resultCode: "jackpot", reelStops: reels("7", "7", "7"), medalsAwarded: 5000, weight: 5 },
  ]),
  operator_standard: Object.freeze([
    { resultCode: "miss", reelStops: reels("BAR", "7", "STAR"), medalsAwarded: 0, weight: 9300 },
    { resultCode: "small", reelStops: reels("CHERRY", "CHERRY", "CHERRY"), medalsAwarded: 50, weight: 600 },
    { resultCode: "medium", reelStops: reels("STAR", "STAR", "STAR"), medalsAwarded: 300, weight: 95 },
    { resultCode: "jackpot", reelStops: reels("7", "7", "7"), medalsAwarded: 5000, weight: 5 },
  ]),
  operator_high_probability_preview: Object.freeze([
    { resultCode: "miss", reelStops: reels("BAR", "7", "STAR"), medalsAwarded: 0, weight: 1000 },
    { resultCode: "small", reelStops: reels("CHERRY", "CHERRY", "CHERRY"), medalsAwarded: 50, weight: 3500 },
    { resultCode: "medium", reelStops: reels("STAR", "STAR", "STAR"), medalsAwarded: 300, weight: 3500 },
    { resultCode: "jackpot", reelStops: reels("7", "7", "7"), medalsAwarded: 5000, weight: 2000 },
  ]),
}) satisfies Readonly<Record<SlotProbabilityProfile, readonly WeightedOutcome[]>>;

export function validateProbabilityTable(table: readonly WeightedOutcome[]): number {
  if (table.length === 0) throw new Error("empty-slot-probability-table");
  let total = 0;
  for (const outcome of table) {
    if (!Number.isSafeInteger(outcome.weight) || outcome.weight <= 0 ||
        !Number.isSafeInteger(outcome.medalsAwarded) || outcome.medalsAwarded < 0 ||
        outcome.medalsAwarded > MAX_SLOT_MEDALS || outcome.reelStops.length !== 3) {
      throw new Error("invalid-slot-probability-table");
    }
    total += outcome.weight;
  }
  if (!Number.isSafeInteger(total) || total <= 0) {
    throw new Error("invalid-slot-probability-total");
  }
  return total;
}

export function selectSlotOutcome(
  profile: SlotProbabilityProfile,
  randomInteger: (maxExclusive: number) => number = randomInt,
): SlotOutcome {
  const table = SLOT_PROBABILITY_TABLES[profile];
  const total = validateProbabilityTable(table);
  const draw = randomInteger(total);
  if (!Number.isSafeInteger(draw) || draw < 0 || draw >= total) {
    throw new Error("invalid-slot-random-value");
  }
  let boundary = 0;
  for (const outcome of table) {
    boundary += outcome.weight;
    if (draw < boundary) {
      return {
        resultCode: outcome.resultCode,
        reelStops: [...outcome.reelStops],
        medalsAwarded: outcome.medalsAwarded,
      };
    }
  }
  throw new Error("slot-outcome-not-found");
}

export function createSlotPlayId(uid: string, requestId: unknown): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error("invalid-slot-user-id");
  return createHash("sha256")
    .update(`slot:${uid}:${assertCoinRequestId(requestId)}`, "utf8")
    .digest("hex");
}

export function assertMemberSlotInput(value: unknown): { requestId: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid-slot-input");
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== "requestId")) {
    throw new Error("unknown-slot-input");
  }
  return { requestId: assertCoinRequestId(input.requestId) };
}

export function assertStatusInput(value: unknown): void {
  if (value != null && (typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value as object).length !== 0)) throw new Error("unknown-status-input");
}
