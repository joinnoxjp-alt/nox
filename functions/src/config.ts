export const REGION = "asia-northeast1";

export const callableOptions = {
  region: REGION,
  enforceAppCheck: true
} as const;

export const publicCallableOptions = {
  region: REGION,
  enforceAppCheck: false
} as const;

export const adminCallableOptions = {
  region: REGION,
  enforceAppCheck: false
} as const;

export const STORE_INVITE_VALIDITY_DAYS = 7;

export const STORE_REGISTER_BASE_URL =
  "https://joinnox.jp/pages/store-register.html";
