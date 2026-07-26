import {
  defineSecret
} from "firebase-functions/params";

import {
  FUNCTIONS_RUNTIME_SERVICE_ACCOUNT,
  REGION
} from "../config";

export const DISCORD_OPERATIONS_WEBHOOK_URL =
  defineSecret(
    "DISCORD_OPERATIONS_WEBHOOK_URL"
  );

export const discordTriggerOptions = {
  region: REGION,
  retry: false,
  serviceAccount:
    FUNCTIONS_RUNTIME_SERVICE_ACCOUNT,
  secrets: [
    DISCORD_OPERATIONS_WEBHOOK_URL
  ]
};
