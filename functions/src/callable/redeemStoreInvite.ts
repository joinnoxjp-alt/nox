import {
  HttpsError,
  onCall
} from "firebase-functions/v2/https";

import {
  authenticatedCallableOptions
} from "../config";

import {
  firebaseAuth,
  firestore
} from "../firebaseAdmin";

import {
  STORE_INVITE_REDEMPTION_REASONS
} from "../errors/storeInviteErrors";

import {
  hashInviteToken,
  isValidInviteTokenInput,
  normalizeInviteEmail
} from "../security/inviteToken";

import type {
  BusinessScope,
  RedeemStoreInviteInput,
  RedeemStoreInviteOutput
} from "../types/storeInvite";

import {
  FieldValue
} from "firebase-admin/firestore";

const DOCUMENT_ID_PATTERN =
  /^[A-Za-z0-9_-]{1,128}$/;

const VALID_BUSINESS_SCOPES =
  new Set<BusinessScope>([
    "night",
    "general",
    "both"
  ]);

function redemptionError(
  code:
    | "permission-denied"
    | "failed-precondition"
    | "not-found"
    | "already-exists",
  reason:
    typeof STORE_INVITE_REDEMPTION_REASONS[
      keyof typeof STORE_INVITE_REDEMPTION_REASONS
    ]
): HttpsError {
  return new HttpsError(
    code,
    "The store invite cannot be redeemed.",
    { reason }
  );
}

function requiredText(
  value: unknown,
  maximumLength: number
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (
    !normalized ||
    normalized.length > maximumLength
  ) {
    return null;
  }

  return normalized;
}

function optionalText(
  value: unknown,
  maximumLength: number
): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(
    0,
    maximumLength
  );
}

function parseBusinessScope(
  value: unknown
): BusinessScope | null {
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

function isUnexpired(
  value: unknown
): boolean {
  if (
    typeof value !== "object" ||
    value === null ||
    !("toMillis" in value) ||
    typeof value.toMillis !== "function"
  ) {
    return false;
  }

  try {
    const milliseconds = value.toMillis();

    return (
      Number.isFinite(milliseconds) &&
      milliseconds > Date.now()
    );
  } catch {
    return false;
  }
}

export const redeemStoreInvite =
  onCall<
    RedeemStoreInviteInput,
    Promise<RedeemStoreInviteOutput>
  >(
    authenticatedCallableOptions,
    async (request) => {
      if (!request.auth) {
        throw new HttpsError(
          "unauthenticated",
          "Authentication is required."
        );
      }

      const input = request.data;

      if (
        typeof input !== "object" ||
        input === null ||
        Array.isArray(input) ||
        Object.keys(input).length !== 2 ||
        !isValidInviteTokenInput(
          input.inviteToken
        )
      ) {
        throw new HttpsError(
          "invalid-argument",
          "The request is invalid."
        );
      }

      const ownerName = requiredText(
        input.ownerName,
        120
      );

      if (!ownerName) {
        throw new HttpsError(
          "invalid-argument",
          "The request is invalid."
        );
      }

      const uid = request.auth.uid;

      let authUser;

      try {
        authUser =
          await firebaseAuth.getUser(uid);
      } catch {
        throw new HttpsError(
          "permission-denied",
          "The authenticated user is unavailable."
        );
      }

      if (
        authUser.disabled ||
        !authUser.email
      ) {
        throw new HttpsError(
          "permission-denied",
          "The authenticated user is unavailable."
        );
      }

      if (!authUser.emailVerified) {
        throw redemptionError(
          "failed-precondition",
          STORE_INVITE_REDEMPTION_REASONS
            .EMAIL_NOT_VERIFIED
        );
      }

      let authenticatedEmail: string;

      try {
        authenticatedEmail =
          normalizeInviteEmail(
            authUser.email
          );
      } catch {
        throw new HttpsError(
          "permission-denied",
          "The authenticated user is unavailable."
        );
      }

      const tokenHash =
        hashInviteToken(
          input.inviteToken
        );

      const inviteReference =
        firestore.doc(
          `storeInvites/${tokenHash}`
        );
      const userReference =
        firestore.doc(`users/${uid}`);
      const storeReference =
        firestore.doc(`stores/${uid}`);

      return firestore.runTransaction(
        async (transaction) => {
          const inviteSnapshot =
            await transaction.get(
              inviteReference
            );

          if (!inviteSnapshot.exists) {
            throw redemptionError(
              "not-found",
              STORE_INVITE_REDEMPTION_REASONS
                .INVALID_INVITE
            );
          }

          const inviteData =
            inviteSnapshot.data();
          const sourceStoreApplicationId =
            requiredText(
              inviteData
                ?.sourceStoreApplicationId,
              128
            );

          if (
            !sourceStoreApplicationId ||
            !DOCUMENT_ID_PATTERN.test(
              sourceStoreApplicationId
            )
          ) {
            throw redemptionError(
              "not-found",
              STORE_INVITE_REDEMPTION_REASONS
                .INVALID_INVITE
            );
          }

          const applicationReference =
            firestore.doc(
              "storeApplications/" +
                sourceStoreApplicationId
            );

          const [
            userSnapshot,
            storeSnapshot,
            applicationSnapshot
          ] = await Promise.all([
            transaction.get(userReference),
            transaction.get(storeReference),
            transaction.get(
              applicationReference
            )
          ]);

          const userData =
            userSnapshot.data();
          const storeData =
            storeSnapshot.data();
          const applicationData =
            applicationSnapshot.data();

          const isSameUidRedemption =
            inviteData?.status ===
              "redeemed" &&
            inviteData.used === true &&
            inviteData.usedBy === uid &&
            inviteData.registeredUid ===
              uid;

          if (isSameUidRedemption) {
            const inviteScope =
              parseBusinessScope(
                inviteData.businessScope
              );

            if (
              !userSnapshot.exists ||
              userData?.role !== "store" ||
              userData.status !== "active" ||
              !storeSnapshot.exists ||
              storeData?.ownerId !== uid ||
              storeData
                .sourceStoreApplicationId !==
                sourceStoreApplicationId ||
              storeData.businessScope !==
                inviteScope ||
              !applicationSnapshot.exists ||
              applicationData
                ?.registeredOwnerId !== uid ||
              applicationData
                .inviteStatus !== "redeemed" ||
              !inviteScope
            ) {
              throw redemptionError(
                "failed-precondition",
                STORE_INVITE_REDEMPTION_REASONS
                  .REGISTRATION_DATA_INTEGRITY
              );
            }

            return {
              redeemed: true,
              alreadyRedeemed: true
            };
          }

          if (
            inviteData?.status !== "issued" ||
            inviteData.used !== false ||
            !isUnexpired(
              inviteData.expiresAt
            )
          ) {
            throw redemptionError(
              "not-found",
              STORE_INVITE_REDEMPTION_REASONS
                .INVALID_INVITE
            );
          }

          let invitedEmail: string;

          try {
            invitedEmail =
              normalizeInviteEmail(
                inviteData.invitedEmail
              );
          } catch {
            throw redemptionError(
              "not-found",
              STORE_INVITE_REDEMPTION_REASONS
                .INVALID_INVITE
            );
          }

          if (
            invitedEmail !==
            authenticatedEmail
          ) {
            throw redemptionError(
              "permission-denied",
              STORE_INVITE_REDEMPTION_REASONS
                .INVALID_INVITE
            );
          }

          if (
            !userSnapshot.exists ||
            userData?.role !== "user" ||
            userData.status !== "pending"
          ) {
            throw redemptionError(
              "failed-precondition",
              STORE_INVITE_REDEMPTION_REASONS
                .USER_NOT_PENDING
            );
          }

          if (storeSnapshot.exists) {
            throw redemptionError(
              "already-exists",
              STORE_INVITE_REDEMPTION_REASONS
                .STORE_ALREADY_EXISTS
            );
          }

          const inviteScope =
            parseBusinessScope(
              inviteData.businessScope
            );
          const applicationScope =
            parseBusinessScope(
              applicationData?.businessScope
            );
          const storeName = requiredText(
            inviteData.storeName,
            120
          );
          const applicationStoreName =
            requiredText(
              applicationData?.storeName,
              120
            );

          if (
            !applicationSnapshot.exists ||
            applicationData?.status !==
              "approved" ||
            applicationData.inviteId !==
              tokenHash ||
            applicationData.inviteStatus !==
              "active" ||
            applicationData
              .registeredOwnerId ||
            !inviteScope ||
            !applicationScope ||
            inviteScope !==
              applicationScope ||
            !storeName ||
            storeName !==
              applicationStoreName
          ) {
            throw redemptionError(
              "failed-precondition",
              STORE_INVITE_REDEMPTION_REASONS
                .REGISTRATION_DATA_INTEGRITY
            );
          }

          transaction.update(
            userReference,
            {
              role: "store",
              status: "active",
              storeName,
              updatedAt:
                FieldValue.serverTimestamp()
            }
          );

          transaction.create(
            storeReference,
            {
              ownerId: uid,
              ownerName,
              storeName,
              email: authenticatedEmail,
              businessScope: inviteScope,
              businessType: optionalText(
                applicationData.businessType,
                120
              ),
              area: optionalText(
                applicationData.area,
                120
              ),
              address: optionalText(
                applicationData.address,
                240
              ),
              sourceStoreApplicationId,
              createdAt:
                FieldValue.serverTimestamp(),
              updatedAt:
                FieldValue.serverTimestamp(),
              schemaVersion: 1
            }
          );

          transaction.update(
            inviteReference,
            {
              status: "redeemed",
              used: true,
              usedAt:
                FieldValue.serverTimestamp(),
              usedBy: uid,
              registeredUid: uid
            }
          );

          transaction.update(
            applicationReference,
            {
              registeredOwnerId: uid,
              registeredAt:
                FieldValue.serverTimestamp(),
              registrationStatus:
                "completed",
              inviteStatus: "redeemed",
              updatedAt:
                FieldValue.serverTimestamp()
            }
          );

          return {
            redeemed: true,
            alreadyRedeemed: false
          };
        }
      );
    }
  );
