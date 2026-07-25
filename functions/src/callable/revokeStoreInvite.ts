import {
  HttpsError,
  onCall
} from "firebase-functions/v2/https";

import {
  callableOptions
} from "../config";

export const revokeStoreInvite =
  onCall(
    callableOptions,
    async () => {
      throw new HttpsError(
        "unimplemented",
        "revokeStoreInvite is not implemented."
      );
    }
  );
