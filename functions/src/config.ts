export const REGION = "asia-northeast1";

const FUNCTIONS_RUNTIME_SERVICE_ACCOUNT =
  "nox-functions-runtime@noxapp-29171.iam.gserviceaccount.com";

export const callableOptions = {
  region: REGION,
  enforceAppCheck: true
} as const;

export const publicCallableOptions = {
  region: REGION,
  enforceAppCheck: false,
  serviceAccount: FUNCTIONS_RUNTIME_SERVICE_ACCOUNT
} as const;

export const adminCallableOptions = {
  region: REGION,
  enforceAppCheck: false,
  serviceAccount: FUNCTIONS_RUNTIME_SERVICE_ACCOUNT
} as const;

export const authenticatedCallableOptions = {
  region: REGION,
  enforceAppCheck: false,
  serviceAccount: FUNCTIONS_RUNTIME_SERVICE_ACCOUNT
} as const;

export const STORE_INVITE_VALIDITY_DAYS = 7;

export const STORE_REGISTER_BASE_URL =
  "https://joinnox.jp/pages/store-register.html";
