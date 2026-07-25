import {
  STORE_INVITE_ERROR_CODES,
  StoreInviteUtilityError
} from "../errors/storeInviteErrors";

import {
  normalizeInviteEmail
} from "./inviteToken";

function maskLabel(label: string): string {
  return `${label.slice(0, 1)}***`;
}

export function createInviteEmailHint(
  email: string
): string {
  const normalizedEmail =
    normalizeInviteEmail(email);

  const emailParts =
    normalizedEmail.split("@");

  if (
    emailParts.length !== 2 ||
    !emailParts[0] ||
    !emailParts[1]
  ) {
    throw new StoreInviteUtilityError(
      STORE_INVITE_ERROR_CODES.INVALID_EMAIL
    );
  }

  const domainParts =
    emailParts[1].split(".");

  if (
    domainParts.length < 2 ||
    domainParts.some((part) => !part)
  ) {
    throw new StoreInviteUtilityError(
      STORE_INVITE_ERROR_CODES.INVALID_EMAIL
    );
  }

  const topLevelDomain =
    domainParts.at(-1);

  if (!topLevelDomain) {
    throw new StoreInviteUtilityError(
      STORE_INVITE_ERROR_CODES.INVALID_EMAIL
    );
  }

  return (
    `${maskLabel(emailParts[0])}@` +
    `${maskLabel(domainParts[0])}.` +
    topLevelDomain
  );
}
