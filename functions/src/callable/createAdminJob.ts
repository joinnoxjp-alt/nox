import { HttpsError, onCall } from "firebase-functions/v2/https";

import { error as logError } from "firebase-functions/logger";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { adminCallableOptions } from "../config";

import { firestore } from "../firebaseAdmin";

import { assertActiveAdmin } from "../security/adminAuthorization";
import { cachedStoreCoverUrl } from "../domain/storeCoverCache";
import { canonicalJobCompatibilityChanges } from "../domain/jobFields";
import { adminJobSourceFields } from "../domain/adminJobSource";
import { parseAdminJobInput } from "../domain/adminJobInput";

function publicError(
  code: "invalid-argument" | "not-found" | "failed-precondition" | "internal",
  message: string,
): HttpsError {
  return new HttpsError(code, message);
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

  const input = parseAdminJobInput(request.data);

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
      address: input.address, station: input.station, workHours: input.workHours,
      requirements: input.requirements, benefits: input.benefits, back: input.back,
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
      targetGender: input.targetGender,
      position: "キャスト",

      area: input.area,
      address: input.address || (typeof store.address === "string" ? store.address : ""),
      station: input.station,
      businessHours: "",

      salary: input.salary,
      trial: "",
      dailyPay: input.dailyPay,
      beginner: input.beginner === "" ? input.listingSource === "official" : input.beginner,

      description: input.description,
      requirements: input.requirements,
      benefits: input.benefits,
      back: input.back,
      workHours: input.workHours,

      imageStoragePaths: [],
      imageUrls: [],
      storeCoverImageUrl: cachedStoreCoverUrl(store.coverImageUrl),

      status: "approved",
      isPublic: true,
      contractListingStatus: "active",

      businessScope: input.businessScope,
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
