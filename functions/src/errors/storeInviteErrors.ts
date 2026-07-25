export const STORE_INVITE_ERROR_CODES = {
  INVALID_TOKEN: "invalid-token",
  INVALID_EMAIL: "invalid-email"
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
    "The invite email is invalid."
};

export class StoreInviteUtilityError extends Error {
  readonly code: StoreInviteErrorCode;

  constructor(code: StoreInviteErrorCode) {
    super(STORE_INVITE_ERROR_MESSAGES[code]);
    this.name = "StoreInviteUtilityError";
    this.code = code;
  }
}
