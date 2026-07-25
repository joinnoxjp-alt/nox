import {
  HttpsError,
  onCall
} from "firebase-functions/v2/https";

import {
  callableOptions
} from "../config";

export const approveStoreApplicationAndIssueInvite =
  onCall(
    callableOptions,
    async () => {
      throw new HttpsError(
        "unimplemented",
        "approveStoreApplicationAndIssueInvite is not implemented."
      );
    }
  );
