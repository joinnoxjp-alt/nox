import {
  HttpsError,
  onCall
} from "firebase-functions/v2/https";

import {
  adminCallableOptions,
  STORE_INVITE_VALIDITY_DAYS,
  STORE_REGISTER_BASE_URL
} from "../config";

import {
  firestore
} from "../firebaseAdmin";

import {
  STORE_APPLICATION_APPROVAL_REASONS
} from "../errors/storeInviteErrors";

import {
  generateInviteTokenMaterial,
  normalizeInviteEmail
} from "../security/inviteToken";

import {
  assertActiveAdmin,
  isActiveAdminDocument
} from "../security/adminAuthorization";

import type {
  ApproveStoreApplicationInput,
  ApproveStoreApplicationOutput,
  BusinessScope
} from "../types/storeInvite";

import {
  FieldValue,
  Timestamp
} from "firebase-admin/firestore";

const APPLICATION_ID_PATTERN =
  /^[A-Za-z0-9_-]{1,128}$/;

const EMAIL_PATTERN =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const VALID_BUSINESS_SCOPES =
  new Set<BusinessScope>([
    "night",
    "general",
    "both"
  ]);

function approvalError(
  code:
    | "not-found"
    | "failed-precondition"
    | "already-exists",
  reason:
    typeof STORE_APPLICATION_APPROVAL_REASONS[
      keyof typeof STORE_APPLICATION_APPROVAL_REASONS
    ]
): HttpsError {
  return new HttpsError(
    code,
    "The store application cannot be approved.",
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

export const approveStoreApplicationAndIssueInvite =
  onCall<
    ApproveStoreApplicationInput,
    Promise<ApproveStoreApplicationOutput>
  >(
    adminCallableOptions,
    async (request) => {
      const admin =
        await assertActiveAdmin(
          request.auth
        );

      const input = request.data;

      if (
        typeof input !== "object" ||
        input === null ||
        Array.isArray(input) ||
        Object.keys(input).length !== 1 ||
        typeof input.storeApplicationId !== "string" ||
        !APPLICATION_ID_PATTERN.test(
          input.storeApplicationId
        )
      ) {
        throw new HttpsError(
          "invalid-argument",
          "The request is invalid."
        );
      }

      const material =
        generateInviteTokenMaterial();

      const issuedAt = Timestamp.now();
      const expiresAt = Timestamp.fromMillis(
        issuedAt.toMillis() +
          STORE_INVITE_VALIDITY_DAYS *
            24 *
            60 *
            60 *
            1000
      );

      const adminReference =
        firestore.doc(
          `users/${admin.uid}`
        );
      const applicationReference =
        firestore.doc(
          `storeApplications/${input.storeApplicationId}`
        );
      const inviteReference =
        firestore.doc(
          `storeInvites/${material.tokenHash}`
        );

      await firestore.runTransaction(
        async (transaction) => {
          const [
            adminSnapshot,
            applicationSnapshot,
            inviteSnapshot
          ] = await Promise.all([
            transaction.get(adminReference),
            transaction.get(applicationReference),
            transaction.get(inviteReference)
          ]);

          const adminData =
            adminSnapshot.data();

          if (
            !adminSnapshot.exists ||
            !isActiveAdminDocument(
              adminData
            )
          ) {
            throw new HttpsError(
              "permission-denied",
              "Administrator access is required."
            );
          }

          if (!applicationSnapshot.exists) {
            throw approvalError(
              "not-found",
              STORE_APPLICATION_APPROVAL_REASONS
                .APPLICATION_NOT_FOUND
            );
          }

          const applicationData =
            applicationSnapshot.data();

          if (
            applicationData?.registeredOwnerId
          ) {
            throw approvalError(
              "failed-precondition",
              STORE_APPLICATION_APPROVAL_REASONS
                .APPLICATION_ALREADY_REGISTERED
            );
          }

          if (
            applicationData?.inviteId ||
            applicationData?.inviteStatus ===
              "active"
          ) {
            throw approvalError(
              "already-exists",
              STORE_APPLICATION_APPROVAL_REASONS
                .INVITE_ALREADY_ISSUED
            );
          }

          if (
            applicationData?.status !== "pending"
          ) {
            throw approvalError(
              "failed-precondition",
              STORE_APPLICATION_APPROVAL_REASONS
                .APPLICATION_NOT_PENDING
            );
          }

          const storeName = requiredText(
            applicationData.storeName,
            120
          );
          const businessScope =
            parseBusinessScope(
              applicationData.businessScope
            );
          const contactEmail = requiredText(
            applicationData.contactEmail,
            254
          );

          let invitedEmail: string | null =
            null;

          if (contactEmail) {
            try {
              const normalizedEmail =
                normalizeInviteEmail(
                  contactEmail
                );

              if (
                EMAIL_PATTERN.test(
                  normalizedEmail
                )
              ) {
                invitedEmail =
                  normalizedEmail;
              }
            } catch {
              invitedEmail = null;
            }
          }

          if (
            !storeName ||
            !businessScope ||
            !invitedEmail
          ) {
            throw approvalError(
              "failed-precondition",
              STORE_APPLICATION_APPROVAL_REASONS
                .APPLICATION_INVALID
            );
          }

          if (inviteSnapshot.exists) {
            throw approvalError(
              "already-exists",
              STORE_APPLICATION_APPROVAL_REASONS
                .INVITE_COLLISION
            );
          }

          transaction.create(
            inviteReference,
            {
              sourceStoreApplicationId:
                applicationSnapshot.id,
              storeName,
              invitedEmail,
              businessScope,
              status: "issued",
              used: false,
              expiresAt,
              createdAt:
                FieldValue.serverTimestamp(),
              createdBy:
                admin.uid,
              schemaVersion: 1
            }
          );

          transaction.update(
            applicationReference,
            {
              status: "approved",
              approvedAt:
                FieldValue.serverTimestamp(),
              approvedBy:
                admin.uid,
              inviteId:
                material.tokenHash,
              inviteStatus: "active",
              inviteIssuedAt:
                FieldValue.serverTimestamp(),
              inviteIssuedBy:
                admin.uid,
              updatedAt:
                FieldValue.serverTimestamp()
            }
          );
        }
      );

      const inviteUrl =
        new URL(STORE_REGISTER_BASE_URL);

      inviteUrl.searchParams.set(
        "invite",
        material.token
      );

      return {
        inviteUrl: inviteUrl.toString(),
        expiresAt:
          expiresAt.toDate().toISOString()
      };
    }
  );
