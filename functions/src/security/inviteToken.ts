import {
  createHash,
  randomBytes
} from "node:crypto";

import {
  STORE_INVITE_ERROR_CODES,
  StoreInviteUtilityError
} from "../errors/storeInviteErrors";

import type {
  InviteTokenMaterial
} from "../types/storeInvite";

const INVITE_TOKEN_BYTES = 32;
const INVITE_TOKEN_LENGTH = 43;
const INVITE_TOKEN_PATTERN =
  /^[A-Za-z0-9_-]{43}$/;

export function generateInviteToken(): string {
  return randomBytes(INVITE_TOKEN_BYTES)
    .toString("base64url");
}

export function normalizeInviteEmail(
  email: string
): string {
  const normalizedEmail =
    email.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new StoreInviteUtilityError(
      STORE_INVITE_ERROR_CODES.INVALID_EMAIL
    );
  }

  return normalizedEmail;
}

export function hashInviteToken(
  token: string
): string {
  if (!token || !token.trim()) {
    throw new StoreInviteUtilityError(
      STORE_INVITE_ERROR_CODES.INVALID_TOKEN
    );
  }

  return createHash("sha256")
    .update(token, "utf8")
    .digest("hex");
}

export function isValidInviteTokenInput(
  value: unknown
): value is string {
  return (
    typeof value === "string" &&
    value.length === INVITE_TOKEN_LENGTH &&
    INVITE_TOKEN_PATTERN.test(value)
  );
}

export function generateInviteTokenMaterial():
InviteTokenMaterial {
  const token = generateInviteToken();

  return {
    token,
    tokenHash: hashInviteToken(token)
  };
}
