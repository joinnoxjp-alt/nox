import { HttpsError, onCall } from "firebase-functions/v2/https";

import { error as logError } from "firebase-functions/logger";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { adminCallableOptions } from "../config";

import { firestore } from "../firebaseAdmin";

import { assertActiveAdmin } from "../security/adminAuthorization";
import { cachedStoreCoverUrl } from "../domain/storeCoverCache";
import { canonicalJobCompatibilityChanges } from "../domain/jobFields";
import { adminJobSourceFields } from "../domain/adminJobSource";

type CreateAdminJobInput = {
  listingSource: "official" | "public_info";
  storeName: string;
  ownerId: string;
  title: string;
  businessType: string;
  area: string;
  salary: string;
  description: string;
  closedDay: string;
  applyType: "instagram" | "line" | "x" | "tiktok" | "other";
  applyUrl: string;
  sourceUrl: string;
  sourceCheckedAt: string;
  adminSourceMemo: string;
};
const APPLY_TYPES = new Set(["instagram", "line", "x", "tiktok", "other"]);
const LISTING_SOURCES = new Set(["official", "public_info"]);

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

function safeOptionalUrl(value: unknown): string {
  const result = optionalString(value, 2000);
  if (!result) return "";
  try {
    const parsed = new URL(result);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("protocol");
    return parsed.href;
  } catch {
    throw publicError("invalid-argument", "Application URL is invalid.");
  }
}

function parseInput(value: unknown): CreateAdminJobInput {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw publicError("invalid-argument", "Job input is invalid.");
  }

  const input = value as Record<string, unknown>;
  const applyType = input.applyType ?? "other";
  if (typeof applyType !== "string" || !APPLY_TYPES.has(applyType)) {
    throw publicError("invalid-argument", "Application type is invalid.");
  }
  const listingSource = input.listingSource ?? "official";
  if (typeof listingSource !== "string" || !LISTING_SOURCES.has(listingSource)) {
    throw publicError("invalid-argument", "Listing source is invalid.");
  }
  const sourceCheckedAt = optionalString(input.sourceCheckedAt, 10);
  if (sourceCheckedAt && !/^\d{4}-\d{2}-\d{2}$/.test(sourceCheckedAt)) {
    throw publicError("invalid-argument", "Source check date is invalid.");
  }

  return {
    listingSource: listingSource as CreateAdminJobInput["listingSource"],
    storeName: requiredString(input.storeName, 120),
    ownerId: listingSource === "official" ? requiredString(input.ownerId, 128) : "",
    title: requiredString(input.title, 160),
    businessType: requiredString(input.businessType, 120),
    area: optionalString(input.area, 120),
    salary: optionalString(input.salary, 500),
    description: optionalString(input.description, 5000),
    closedDay: optionalString(input.closedDay, 200),
    applyType: applyType as CreateAdminJobInput["applyType"],
    applyUrl: safeOptionalUrl(input.applyUrl),
    sourceUrl: safeOptionalUrl(input.sourceUrl),
    sourceCheckedAt,
    adminSourceMemo: optionalString(input.adminSourceMemo, 2000),
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
    const storeQuerySnapshot = input.listingSource === "official" ? await firestore
      .collection("stores")
      .where("ownerId", "==", input.ownerId)
      .limit(2)
      .get() : null;

    if (storeQuerySnapshot?.empty) {
      throw publicError("not-found", "Store was not found.");
    }

    if (storeQuerySnapshot && storeQuerySnapshot.size > 1) {
      throw publicError(
        "failed-precondition",
        "Multiple stores use this owner ID.",
      );
    }

    const storeSnapshot = storeQuerySnapshot?.docs[0];
    const sourceFields = adminJobSourceFields(input.listingSource, input.ownerId, storeSnapshot?.id ?? "");

    const store = storeSnapshot?.data() ?? {};

    if (input.listingSource === "official" && store.storeName !== input.storeName) {
      throw publicError(
        "failed-precondition",
        "Store information does not match.",
      );
    }

    const contractByStoreId = storeSnapshot ? await firestore
      .doc(`storeContracts/${storeSnapshot.id}`).get() : null;

    const contractByOwnerId = !contractByStoreId || contractByStoreId.exists
      ? null
      : await firestore.doc(`storeContracts/${input.ownerId}`).get();

    const contractSnapshot = contractByStoreId?.exists
      ? contractByStoreId
      : contractByOwnerId;

    if (input.listingSource === "official" && (!contractSnapshot || !contractSnapshot.exists)) {
      throw publicError("failed-precondition", "Store contract was not found.");
    }

    const now = Timestamp.now();

    if (input.listingSource === "official" && !contractIsActive(contractSnapshot?.data() ?? {}, input.ownerId, now)) {
      throw publicError("failed-precondition", "Store contract is not active.");
    }

    const jobReference = firestore.collection("jobs").doc();

    const auditReference = firestore.collection("adminAuditLogs").doc();

    const batch = firestore.batch();

    const compatibleJobFields = canonicalJobCompatibilityChanges({
      storeName: input.storeName,
      title: input.title,
      businessType: input.businessType,
      area: input.area,
      salary: input.salary,
      description: input.description,
      closedDay: input.closedDay,
      position: "キャスト",
      applyType: input.applyType,
      applyUrl: input.applyUrl,
    });

    batch.create(jobReference, {
      schemaVersion: 1,
      listingSource: sourceFields.listingSource,
      sourceUrl: input.sourceUrl,
      sourceCheckedAt: input.sourceCheckedAt || null,
      adminSourceMemo: input.adminSourceMemo,

      ownerId: sourceFields.ownerId,
      storeId: sourceFields.storeId,
      storeName: input.storeName,
      ...compatibleJobFields,

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

      source: sourceFields.source,
      storeDocumentId: sourceFields.storeDocumentId,
    });

    batch.create(auditReference, {
      actionType: "create_admin_job",
      targetType: "job",
      targetHash: jobReference.id,
      after: {
        jobId: jobReference.id,
        ownerId: input.ownerId,
        storeName: input.storeName,
        listingSource: input.listingSource,
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
