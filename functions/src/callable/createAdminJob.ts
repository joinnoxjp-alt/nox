import { HttpsError, onCall } from "firebase-functions/v2/https";

import { error as logError } from "firebase-functions/logger";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { adminCallableOptions } from "../config";

import { firestore } from "../firebaseAdmin";

import { assertActiveAdmin } from "../security/adminAuthorization";
import { cachedStoreCoverUrl } from "../domain/storeCoverCache";

type CreateAdminJobInput = {
  storeName: string;
  ownerId: string;
  title: string;
  businessType: string;
  area: string;
  salary: string;
  description: string;
};

function publicError(
  code: "invalid-argument" | "not-found" | "failed-precondition" | "internal",
  message: string,
): HttpsError {
  return new HttpsError(code, message);
}

function requiredString(value: unknown, maximumLength: number): string {
  if (typeof value !== "string") {
    throw publicError("invalid-argument", "Job input is invalid.");
  }

  const result = value.trim();

  if (result.length === 0 || result.length > maximumLength) {
    throw publicError("invalid-argument", "Job input is invalid.");
  }

  return result;
}

function optionalString(value: unknown, maximumLength: number): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value !== "string") {
    throw publicError("invalid-argument", "Job input is invalid.");
  }

  const result = value.trim();

  if (result.length > maximumLength) {
    throw publicError("invalid-argument", "Job input is invalid.");
  }

  return result;
}

function parseInput(value: unknown): CreateAdminJobInput {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw publicError("invalid-argument", "Job input is invalid.");
  }

  const input = value as Record<string, unknown>;

  return {
    storeName: requiredString(input.storeName, 120),
    ownerId: requiredString(input.ownerId, 128),
    title: requiredString(input.title, 160),
    businessType: requiredString(input.businessType, 120),
    area: optionalString(input.area, 120),
    salary: optionalString(input.salary, 500),
    description: optionalString(input.description, 5000),
  };
}

function isTimestamp(value: unknown): value is Timestamp {
  return value instanceof Timestamp;
}

function contractIsActive(
  contract: FirebaseFirestore.DocumentData,
  ownerId: string,
  now: Timestamp,
): boolean {
  return (
    contract.ownerId === ownerId &&
    contract.paymentStatus === "paid" &&
    contract.listingStatus === "active" &&
    isTimestamp(contract.contractStartAt) &&
    isTimestamp(contract.contractEndAt) &&
    contract.contractStartAt.toMillis() <= now.toMillis() &&
    contract.contractEndAt.toMillis() >= now.toMillis()
  );
}

export const createAdminJob = onCall(adminCallableOptions, async (request) => {
  const admin = await assertActiveAdmin(request.auth);

  const input = parseInput(request.data);

  try {
    const storeQuerySnapshot = await firestore
      .collection("stores")
      .where("ownerId", "==", input.ownerId)
      .limit(2)
      .get();

    if (storeQuerySnapshot.empty) {
      throw publicError("not-found", "Store was not found.");
    }

    if (storeQuerySnapshot.size > 1) {
      throw publicError(
        "failed-precondition",
        "Multiple stores use this owner ID.",
      );
    }

    const storeSnapshot = storeQuerySnapshot.docs[0];

    const store = storeSnapshot.data();

    if (store.storeName !== input.storeName) {
      throw publicError(
        "failed-precondition",
        "Store information does not match.",
      );
    }

    const contractByStoreId = await firestore
      .doc(`storeContracts/${storeSnapshot.id}`)
      .get();

    const contractByOwnerId = contractByStoreId.exists
      ? null
      : await firestore.doc(`storeContracts/${input.ownerId}`).get();

    const contractSnapshot = contractByStoreId.exists
      ? contractByStoreId
      : contractByOwnerId;

    if (!contractSnapshot || !contractSnapshot.exists) {
      throw publicError("failed-precondition", "Store contract was not found.");
    }

    const now = Timestamp.now();

    if (!contractIsActive(contractSnapshot.data() ?? {}, input.ownerId, now)) {
      throw publicError("failed-precondition", "Store contract is not active.");
    }

    const jobReference = firestore.collection("jobs").doc();

    const auditReference = firestore.collection("adminAuditLogs").doc();

    const batch = firestore.batch();

    batch.create(jobReference, {
      schemaVersion: 1,

      ownerId: input.ownerId,
      storeId: storeSnapshot.id,
      storeName: input.storeName,

      title: input.title,
      category: input.businessType,
      targetGender: "female",
      position: "キャスト",

      area: input.area,
      address: typeof store.address === "string" ? store.address : "",
      station: "",
      businessHours: "",

      salary: input.salary,
      trial: "",
      beginner: true,

      description: input.description,
      requirements: "",
      benefits: "",

      imageStoragePaths: [],
      imageUrls: [],
      storeCoverImageUrl: cachedStoreCoverUrl(store.coverImageUrl),

      status: "approved",
      isPublic: true,
      contractListingStatus: "active",

      businessScope: "night",
      businessType: input.businessType,
      jobType: input.businessType,

      createdAt: FieldValue.serverTimestamp(),
      createdBy: admin.uid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: admin.uid,

      approvedAt: FieldValue.serverTimestamp(),
      approvedBy: admin.uid,

      pausedAt: null,
      pausedBy: null,
      reapprovalRequestedAt: null,
      archivedAt: null,
      archivedBy: null,
      sourceApplicationId: null,

      source: "admin_direct",
      storeDocumentId: storeSnapshot.id,
    });

    batch.create(auditReference, {
      actionType: "create_admin_job",
      targetType: "job",
      targetHash: jobReference.id,
      after: {
        jobId: jobReference.id,
        ownerId: input.ownerId,
        storeName: input.storeName,
        status: "approved",
        isPublic: true,
        contractListingStatus: "active",
      },
      createdAt: FieldValue.serverTimestamp(),
      actorType: "fixed_admin",
    });

    await batch.commit();

    return {
      created: true,
      jobId: jobReference.id,
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }

    logError("Admin job creation failed.", {
      reason: error instanceof Error ? error.message : "unknown",
    });

    throw publicError("internal", "Job creation failed.");
  }
});
