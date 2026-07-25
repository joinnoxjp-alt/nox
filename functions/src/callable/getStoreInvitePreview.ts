import {
  HttpsError,
  onCall
} from "firebase-functions/v2/https";

import {
  callableOptions
} from "../config";

export const getStoreInvitePreview =
  onCall(
    callableOptions,
    async () => {
      throw new HttpsError(
        "unimplemented",
        "getStoreInvitePreview is not implemented."
      );
    }
  );
