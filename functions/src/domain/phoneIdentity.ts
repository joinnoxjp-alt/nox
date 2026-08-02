import { createHmac } from "node:crypto";

export const PHONE_IDENTITY_VERSION = 1;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export function assertEmptyPhoneIdentityInput(value: unknown): void {
  if (value != null &&
      (typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value as object).length !== 0)) {
    throw new Error("unknown-phone-identity-input");
  }
}

export function assertEligiblePhoneIdentityUser(
  emailVerified: boolean,
  role: unknown,
  status: unknown,
): void {
  if (!emailVerified) throw new Error("email-not-verified");
  if (role !== "user" || !["pending", "active"].includes(String(status))) {
    throw new Error("phone-identity-user-ineligible");
  }
}

export function assertE164PhoneNumber(phoneNumber: string): string {
  const normalized = phoneNumber.trim();
  if (!E164_PATTERN.test(normalized)) {
    throw new Error("invalid-e164-phone-number");
  }
  return normalized;
}

export function createPhoneIdentity(
  phoneNumber: string,
  secret: string,
): string {
  if (secret.length < 32) {
    throw new Error("phone-identity-secret-too-short");
  }
  return createHmac("sha256", secret)
    .update(assertE164PhoneNumber(phoneNumber), "utf8")
    .digest("hex");
}

export function maskPhoneNumber(phoneNumber: string): string {
  const normalized = assertE164PhoneNumber(phoneNumber);
  return `${normalized.slice(0, 3)}******${normalized.slice(-4)}`;
}

export function assertPhoneIdentityAvailable(
  currentOwnerUid: unknown,
  requestedUid: string,
  status: unknown = "active",
): void {
  if (status === "deleted" ||
      (typeof currentOwnerUid === "string" && currentOwnerUid !== requestedUid)) {
    throw new Error("phone-identity-already-used");
  }
}

export function createDeletedAccountSafeguard(
  playerState: Record<string, unknown>,
  previousSafeguard: Record<string, unknown>,
): {
  freePlaysConsumed: number;
  monthlyEntryMonths: string[];
  fraudStatus: string;
} {
  const freePlaysConsumed = Number.isInteger(playerState.freePlaysConsumed) &&
      Number(playerState.freePlaysConsumed) >= 0
    ? Number(playerState.freePlaysConsumed)
    : 0;
  const monthlyEntryMonths = Array.isArray(previousSafeguard.monthlyEntryMonths)
    ? previousSafeguard.monthlyEntryMonths.filter(
      (value): value is string => typeof value === "string" && /^\d{4}-\d{2}$/.test(value),
    )
    : [];
  const fraudStatus = typeof previousSafeguard.fraudStatus === "string"
    ? previousSafeguard.fraudStatus
    : "clear";
  return { freePlaysConsumed, monthlyEntryMonths, fraudStatus };
}
