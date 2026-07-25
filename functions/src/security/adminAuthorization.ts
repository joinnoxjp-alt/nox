import {
  HttpsError
} from "firebase-functions/v2/https";

import {
  error as logError
} from "firebase-functions/logger";

import {
  FIXED_ADMIN_EMAIL,
  FIXED_ADMIN_UID
} from "../config";

import {
  firebaseAuth,
  firestore
} from "../firebaseAdmin";

import {
  normalizeInviteEmail
} from "./inviteToken";

interface CallableAuthContext {
  uid: string;
  token: {
    email?: unknown;
    email_verified?: unknown;
  };
}

export interface ActiveAdminIdentity {
  uid: string;
  email: string;
}

function permissionDenied(
  reason: string
): HttpsError {
  logError(
    "Administrator authorization denied.",
    { reason }
  );

  return new HttpsError(
    "permission-denied",
    "Administrator access is required."
  );
}

export function isActiveAdminDocument(
  data: FirebaseFirestore.DocumentData |
    undefined
): boolean {
  return (
    data?.role === "admin" &&
    data.status === "active"
  );
}

export async function assertActiveAdmin(
  auth: CallableAuthContext | undefined
): Promise<ActiveAdminIdentity> {
  if (!auth) {
    throw new HttpsError(
      "unauthenticated",
      "Authentication is required."
    );
  }

  if (auth.uid !== FIXED_ADMIN_UID) {
    throw permissionDenied(
      "fixed-admin-uid-mismatch"
    );
  }

  let userRecord;

  try {
    userRecord =
      await firebaseAuth.getUser(auth.uid);
  } catch {
    throw permissionDenied(
      "admin-auth-record-unavailable"
    );
  }

  if (userRecord.disabled) {
    throw permissionDenied(
      "admin-auth-disabled"
    );
  }

  if (!userRecord.emailVerified) {
    throw permissionDenied(
      "admin-email-unverified"
    );
  }

  let recordEmail: string;
  let tokenEmail: string;

  try {
    recordEmail =
      normalizeInviteEmail(
        userRecord.email ?? ""
      );
    tokenEmail =
      normalizeInviteEmail(
        typeof auth.token.email === "string"
          ? auth.token.email
          : ""
      );
  } catch {
    throw permissionDenied(
      "admin-email-invalid"
    );
  }

  if (
    recordEmail !== FIXED_ADMIN_EMAIL ||
    tokenEmail !== FIXED_ADMIN_EMAIL ||
    auth.token.email_verified !== true
  ) {
    throw permissionDenied(
      "fixed-admin-email-mismatch"
    );
  }

  const adminSnapshot =
    await firestore
      .doc(`users/${auth.uid}`)
      .get();

  if (
    !adminSnapshot.exists ||
    !isActiveAdminDocument(
      adminSnapshot.data()
    )
  ) {
    throw permissionDenied(
      "admin-document-inactive"
    );
  }

  return {
    uid: auth.uid,
    email: recordEmail
  };
}
