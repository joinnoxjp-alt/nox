import {
  HttpsError,
  onCall
} from "firebase-functions/v2/https";

import {
  callableOptions
} from "../config";

export const reissueStoreInvite =
  onCall(
    callableOptions,
    async () => {
      throw new HttpsError(
        "unimplemented",
        "reissueStoreInvite is not implemented."
      );
    }
  );
