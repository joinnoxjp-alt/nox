import {
  HttpsError,
  onCall
} from "firebase-functions/v2/https";

import {
  error as logError
} from "firebase-functions/logger";

import {
  publicCallableOptions
} from "../config";

import {
  firestore
} from "../firebaseAdmin";

import {
  createInviteEmailHint
} from "../security/emailHint";

import {
  hashInviteToken,
  isValidInviteTokenInput,
  normalizeInviteEmail
} from "../security/inviteToken";

import type {
  BusinessScope,
  GetStoreInvitePreviewInput,
  GetStoreInvitePreviewOutput
} from "../types/storeInvite";

const VALID_BUSINESS_SCOPES =
  new Set<BusinessScope>([
    "night",
    "general",
    "both"
  ]);

const INVALID_INVITE_MESSAGE =
  "The invite is invalid or unavailable.";

function invalidInviteError(): HttpsError {
  return new HttpsError(
    "not-found",
    INVALID_INVITE_MESSAGE
  );
}

function parseBusinessScope(
  value: unknown
): BusinessScope | null {
  if (value === undefined) {
    return "night";
  }

  if (
    typeof value === "string" &&
    VALID_BUSINESS_SCOPES.has(
      value as BusinessScope
    )
  ) {
    return value as BusinessScope;
  }

  return null;
}

function parseExpiration(
  value: unknown
): {
  milliseconds: number;
  isoString: string;
} | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("toMillis" in value) ||
    typeof value.toMillis !== "function"
  ) {
    return null;
  }

  try {
    const milliseconds =
      value.toMillis();

    if (!Number.isFinite(milliseconds)) {
      return null;
    }

    return {
      milliseconds,
      isoString:
        new Date(milliseconds).toISOString()
    };

  } catch {
    return null;
  }
}

export const getStoreInvitePreview =
  onCall<
    GetStoreInvitePreviewInput,
    Promise<GetStoreInvitePreviewOutput>
  >(
    publicCallableOptions,
    async (request) => {
      const data = request.data;

      if (
        typeof data !== "object" ||
        data === null ||
        Array.isArray(data) ||
        Object.keys(data).length !== 1 ||
        !isValidInviteTokenInput(
          data.inviteToken
        )
      ) {
        throw new HttpsError(
          "invalid-argument",
          "The invite token format is invalid."
        );
      }

      const tokenHash =
        hashInviteToken(data.inviteToken);

      let inviteSnapshot;

      try {
        inviteSnapshot =
          await firestore
            .doc(`storeInvites/${tokenHash}`)
            .get();

      } catch {
        logError(
          "Invite preview lookup failed."
        );

        throw new HttpsError(
          "internal",
          "The invite could not be checked."
        );
      }

      if (!inviteSnapshot.exists) {
        throw invalidInviteError();
      }

      const inviteData =
        inviteSnapshot.data();

      if (
        !inviteData ||
        inviteData.status !== "issued" ||
        inviteData.used !== false
      ) {
        throw invalidInviteError();
      }

      const expiration =
        parseExpiration(
          inviteData.expiresAt
        );

      if (
        !expiration ||
        expiration.milliseconds <= Date.now()
      ) {
        throw invalidInviteError();
      }

      const businessScope =
        parseBusinessScope(
          inviteData.businessScope
        );

      if (!businessScope) {
        logError(
          "Invite data integrity error.",
          {
            reason:
              "invalid-business-scope"
          }
        );

        throw invalidInviteError();
      }

      const storeName =
        typeof inviteData.storeName === "string"
          ? inviteData.storeName.trim()
          : "";

      const invitedEmail =
        typeof inviteData.invitedEmail === "string"
          ? inviteData.invitedEmail
          : "";

      if (!storeName || !invitedEmail) {
        throw invalidInviteError();
      }

      let emailHint: string;
      let normalizedInvitedEmail: string;

      try {
        normalizedInvitedEmail =
          normalizeInviteEmail(
            invitedEmail
          );
        emailHint =
          createInviteEmailHint(
            normalizedInvitedEmail
          );

      } catch {
        throw invalidInviteError();
      }

      const output:
        GetStoreInvitePreviewOutput = {
        valid: true,
        storeName,
        emailHint,
        expiresAt:
          expiration.isoString,
        businessScope
      };

      if (request.auth) {
        const authenticatedEmail =
          request.auth.token.email;

        try {
          output
            .emailMatchesAuthenticatedUser =
              typeof authenticatedEmail ===
                "string" &&
              normalizeInviteEmail(
                authenticatedEmail
              ) === normalizedInvitedEmail;
        } catch {
          output
            .emailMatchesAuthenticatedUser =
              false;
        }
      }

      return output;
    }
  );
