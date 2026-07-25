export const REGION = "asia-northeast1";

export const callableOptions = {
  region: REGION,
  enforceAppCheck: true
} as const;

export const publicCallableOptions = {
  region: REGION,
  enforceAppCheck: false
} as const;
