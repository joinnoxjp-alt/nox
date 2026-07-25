export const STORE_INVITE_ERROR_CODES = {
  INVALID_TOKEN: "invalid-token",
  INVALID_EMAIL: "invalid-email",
  INVALID_INVITE: "invalid-invite",
  INVITE_DATA_INTEGRITY:
    "invite-data-integrity"
} as const;

export type StoreInviteErrorCode =
  typeof STORE_INVITE_ERROR_CODES[
    keyof typeof STORE_INVITE_ERROR_CODES
  ];

const STORE_INVITE_ERROR_MESSAGES: Record<
  StoreInviteErrorCode,
  string
> = {
  [STORE_INVITE_ERROR_CODES.INVALID_TOKEN]:
    "The invite token is invalid.",
  [STORE_INVITE_ERROR_CODES.INVALID_EMAIL]:
    "The invite email is invalid.",
  [STORE_INVITE_ERROR_CODES.INVALID_INVITE]:
    "The invite is invalid or unavailable.",
  [STORE_INVITE_ERROR_CODES.INVITE_DATA_INTEGRITY]:
    "The invite data is inconsistent."
};

export class StoreInviteUtilityError extends Error {
  readonly code: StoreInviteErrorCode;

  constructor(code: StoreInviteErrorCode) {
    super(STORE_INVITE_ERROR_MESSAGES[code]);
    this.name = "StoreInviteUtilityError";
    this.code = code;
  }
}

export const STORE_APPLICATION_APPROVAL_REASONS = {
  APPLICATION_NOT_FOUND:
    "store-application-not-found",
  APPLICATION_NOT_PENDING:
    "store-application-not-pending",
  APPLICATION_INVALID:
    "store-application-invalid",
  APPLICATION_ALREADY_REGISTERED:
    "store-application-already-registered",
  INVITE_ALREADY_ISSUED:
    "invite-already-issued",
  INVITE_COLLISION:
    "invite-collision"
} as const;

export type StoreApplicationApprovalReason =
  typeof STORE_APPLICATION_APPROVAL_REASONS[
    keyof typeof STORE_APPLICATION_APPROVAL_REASONS
  ];

export const STORE_INVITE_REDEMPTION_REASONS = {
  EMAIL_NOT_VERIFIED:
    "email-not-verified",
  USER_NOT_PENDING:
    "user-not-pending",
  INVALID_INVITE:
    "invalid-invite",
  STORE_ALREADY_EXISTS:
    "store-already-exists",
  REGISTRATION_DATA_INTEGRITY:
    "registration-data-integrity"
} as const;

export type StoreInviteRedemptionReason =
  typeof STORE_INVITE_REDEMPTION_REASONS[
    keyof typeof STORE_INVITE_REDEMPTION_REASONS
  ];
