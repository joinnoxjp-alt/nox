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
import { duplicateLockIds, findDuplicateJob } from "../domain/jobDuplicate";

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

    const resolvedAddress = input.address || (typeof store.address === "string" ? store.address : "");
    const resolvedBeginner = input.beginner === "" ? input.listingSource === "official" : input.beginner;
    const compatibleJobFields = canonicalJobCompatibilityChanges({
      storeName: input.storeName,
      title: input.title,
      businessType: input.businessType,
      area: input.area,
      salary: input.salary,
      description: input.description,
      closedDay: input.closedDay,
      address: resolvedAddress, station: input.station, workHours: input.workHours,
      requirements: input.requirements, benefits: input.benefits, back: input.back,
      position: input.position, age: input.age, shift: input.shift,
      dailyPay: input.dailyPay, trial: input.trial, beginner: resolvedBeginner,
      applyType: input.applyType,
      applyUrl: input.applyUrl,
    });

    const jobReference = input.jobId
      ? firestore.collection("jobs").doc(input.jobId)
      : firestore.collection("jobs").doc();
    const auditReference = firestore.collection("adminAuditLogs").doc();
    const lockIds = duplicateLockIds(input.storeName, input.area);
    await firestore.runTransaction(async (transaction) => {
      const existingSnapshot = await transaction.get(firestore.collection("jobs"));
      const duplicate = findDuplicateJob({
        id: jobReference.id, storeName: input.storeName, area: input.area, address: input.address,
        station: input.station, businessType: input.businessType, salary: input.salary, back: input.back,
      }, existingSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      if (duplicate) {
        const prefix = duplicate.level === "past" ? "過去に同店舗の求人があります。" : duplicate.level === "confirmed" ? "同じ店舗の求人がすでに登録されています。" : "同じ店舗と思われる求人が存在します。既存求人の条件が更新されている可能性があります。";
        throw new HttpsError("already-exists", `${prefix} 求人ID: ${duplicate.job.id}`);
      }
      const lockRefs = lockIds.map((lockId) => firestore.doc(`jobDuplicateLocks/${lockId}`));
      const lockSnapshots = await Promise.all(lockRefs.map((lockRef) => transaction.get(lockRef)));
      const lockedJobIds = [...new Set(lockSnapshots.filter((lock) => lock.exists).map((lock) => String(lock.data()?.jobId || "")).filter(Boolean))];
      const lockedJobs = await Promise.all(lockedJobIds.map((jobId) => transaction.get(firestore.doc(`jobs/${jobId}`))));
      const activeLockedJob = lockedJobs.find((lockedJob) => lockedJob.exists);
      if (activeLockedJob) {
        throw new HttpsError("already-exists", `同じ店舗の求人がすでに登録されています。 求人ID: ${activeLockedJob.id}`);
      }
      for (const lockRef of lockRefs) {
        transaction.set(lockRef, { jobId: jobReference.id, createdAt: FieldValue.serverTimestamp() });
      }
      transaction.create(jobReference, {
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
      position: input.position,

      area: input.area,
      address: resolvedAddress,
      station: input.station,
      businessHours: "",

      salary: input.salary,
      trial: input.trial,
      dailyPay: input.dailyPay,
      beginner: resolvedBeginner,

      description: input.description,
      requirements: input.requirements,
      benefits: input.benefits,
      back: input.back,
      workHours: input.workHours,
      age: input.age,
      shift: input.shift,

      mainImage: input.mainImage,
      imageUrl: input.mainImage,
      image: input.mainImage,
      mainImageStoragePath: input.mainImageStoragePath,
      imageStoragePaths: input.imageStoragePaths,
      imageUrls: input.imageUrls,
      images: input.imageUrls,
      topOrder: input.topOrder,
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

      transaction.create(auditReference, {
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
    });

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
