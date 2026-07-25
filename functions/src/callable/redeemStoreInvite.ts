import {
  HttpsError,
  onCall
} from "firebase-functions/v2/https";

import {
  callableOptions
} from "../config";

export const redeemStoreInvite =
  onCall(
    callableOptions,
    async () => {
      throw new HttpsError(
        "unimplemented",
        "redeemStoreInvite is not implemented."
      );
    }
  );
