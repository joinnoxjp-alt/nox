import { defineSecret } from "firebase-functions/params";

export const PHONE_IDENTITY_HMAC_SECRET = defineSecret(
  "PHONE_IDENTITY_HMAC_SECRET",
);
