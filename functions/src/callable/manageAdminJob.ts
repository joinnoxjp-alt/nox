import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";

import { createAdminAuditLogDraft } from "../audit/adminAudit";
import { adminCallableOptions } from "../config";
import { firestore } from "../firebaseAdmin";
import { assertActiveAdmin } from "../security/adminAuthorization";
import { canonicalJobCompatibilityChanges } from "../domain/jobFields";
import { normalizeContactEmail, normalizeContactPhone } from "../domain/jobContact";

const EDITABLE_FIELDS = new Set([
  "storeName", "shopName", "name", "businessType", "jobType", "area",
  "location", "salary", "salaryText", "title", "jobTitle", "description",
  "jobDescription", "storeDescription", "selfPr", "workHours", "workingHours",
  "requirements", "qualification", "benefits", "treatment", "applyUrl",
  "lineUrl", "contactUrl", "topOrder", "status", "mainImage", "imageUrl",
  "image", "images", "imageUrls", "topFeatured", "category", "position",
  "occupation", "address", "workLocation", "station", "nearestStation",
  "back", "backs", "dailyPay", "trial", "trialEntry", "beginner",
  "welcomeBeginners", "age", "hiringAge", "shift", "shiftDetails",
  "targetGender", "businessScope", "pr", "applyType", "instagramUrl",
  "xUrl", "twitterUrl", "tiktokUrl", "closedDay",
  "sourceUrl", "sourceCheckedAt", "adminSourceMemo",
  "contactPhone", "contactEmail",
  "mainImageStoragePath", "imageStoragePaths",
]);
const IMMUTABLE_SOURCE_FIELDS = new Set([
  "listingSource", "source", "ownerId", "storeId", "storeDocumentId",
]);
const JOB_STATUSES = new Set([
  "draft", "pending", "approved", "paused", "reapproval_pending",
  "rejected", "archived",
]);
const STRING_LIMITS: Record<string, number> = {
  storeName: 120, shopName: 120, name: 120, businessType: 120,
  jobType: 120, area: 120, location: 120, salary: 500,
  salaryText: 500, title: 160, jobTitle: 160, description: 5000,
  jobDescription: 5000, storeDescription: 5000, selfPr: 5000,
  workHours: 500, workingHours: 500, requirements: 5000,
  qualification: 5000, benefits: 5000, treatment: 5000,
  applyUrl: 2000, lineUrl: 2000, contactUrl: 2000, instagramUrl: 2000,
  xUrl: 2000, twitterUrl: 2000, tiktokUrl: 2000,
  mainImage: 2000, imageUrl: 2000, image: 2000,
  category: 120, position: 120, occupation: 120, address: 500,
  workLocation: 500, station: 200, nearestStation: 200, back: 1000,
  backs: 1000, age: 200, hiringAge: 200, shift: 1000,
  shiftDetails: 1000, pr: 5000, closedDay: 200,
  sourceUrl: 2000, sourceCheckedAt: 10, adminSourceMemo: 2000,
  contactPhone: 300, contactEmail: 254,
  mainImageStoragePath: 1000,
};
const BOOLEAN_FIELDS = new Set(["dailyPay", "trial", "trialEntry", "beginner", "welcomeBeginners"]);
const TARGET_GENDERS = new Set(["female", "male", "all"]);
const BUSINESS_SCOPES = new Set(["night", "general", "both"]);
const APPLY_TYPES = new Set(["instagram", "line", "x", "tiktok", "other"]);

function isSafeExternalUrl(value: string): boolean {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "求人の操作内容が正しくありません。");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, max = 160): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new HttpsError("invalid-argument", "求人IDが正しくありません。");
  }
  return value.trim();
}

function safeSummary(data: FirebaseFirestore.DocumentData | undefined) {
  if (!data) return {};
  return {
    title: data.title ?? null,
    storeName: data.storeName ?? null,
    status: data.status ?? null,
    isPublic: data.isPublic ?? null,
    topFeatured: data.topFeatured ?? null,
    listingSource: data.listingSource ?? "official",
  };
}

export const manageAdminJob = onCall(adminCallableOptions, async (request) => {
  const admin = await assertActiveAdmin(request.auth);
  const input = record(request.data);
  const action = text(input.action, 20);
  const jobId = text(input.jobId, 160);
  const jobRef = firestore.doc(`jobs/${jobId}`);
  const auditRef = firestore.collection("adminAuditLogs").doc();

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    if (!snapshot.exists) {
      throw new HttpsError("not-found", "対象の求人が見つかりません。");
    }
    const before = snapshot.data() ?? {};

    if (action === "delete") {
      transaction.delete(jobRef);
      transaction.create(auditRef, createAdminAuditLogDraft(admin, {
        action: "job_deleted", targetType: "job", targetId: jobId,
        before: safeSummary(before),
      }));
      return { success: true, action, jobId };
    }

    let changes: Record<string, unknown> = {};
    if (action === "update") {
      const requested = record(input.changes);
      for (const [key, value] of Object.entries(requested)) {
        if (IMMUTABLE_SOURCE_FIELDS.has(key)) {
          throw new HttpsError("invalid-argument", `変更できない掲載元項目が含まれています: ${key}`);
        }
        if (!EDITABLE_FIELDS.has(key)) {
          throw new HttpsError("invalid-argument", `変更できない項目が含まれています: ${key}`);
        }
        if (key in STRING_LIMITS && (typeof value !== "string" || value.length > STRING_LIMITS[key])) {
          throw new HttpsError("invalid-argument", `${key} の入力内容が正しくありません。`);
        }
        if (key === "status" && (typeof value !== "string" || !JOB_STATUSES.has(value))) {
          throw new HttpsError("invalid-argument", "求人状態が正しくありません。");
        }
        if (key === "topOrder" && (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 999999)) {
          throw new HttpsError("invalid-argument", "表示順が正しくありません。");
        }
        if (key === "topFeatured" && typeof value !== "boolean") {
          throw new HttpsError("invalid-argument", "TOP掲載状態が正しくありません。");
        }
        if (BOOLEAN_FIELDS.has(key) && value !== "" && typeof value !== "boolean") {
          throw new HttpsError("invalid-argument", `${key} must be a boolean or empty.`);
        }
        if (key === "targetGender" && (typeof value !== "string" || !TARGET_GENDERS.has(value))) {
          throw new HttpsError("invalid-argument", "targetGender is invalid.");
        }
        if (key === "businessScope" && (typeof value !== "string" || !BUSINESS_SCOPES.has(value))) {
          throw new HttpsError("invalid-argument", "businessScope is invalid.");
        }
        if (key === "applyType" && (typeof value !== "string" || !APPLY_TYPES.has(value))) {
          throw new HttpsError("invalid-argument", "applyType is invalid.");
        }
        if (key === "sourceCheckedAt" && value !== "" && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))) {
          throw new HttpsError("invalid-argument", "sourceCheckedAt is invalid.");
        }
        if (["applyUrl", "lineUrl", "contactUrl", "instagramUrl", "xUrl", "twitterUrl", "tiktokUrl", "sourceUrl"].includes(key) &&
            typeof value === "string" && !isSafeExternalUrl(value.trim())) {
          throw new HttpsError("invalid-argument", "Application URL must use HTTP or HTTPS.");
        }
        if ((key === "images" || key === "imageUrls" || key === "imageStoragePaths") &&
            (!Array.isArray(value) || value.length > 10 || value.some((item) => typeof item !== "string" || item.length > 2000))) {
          throw new HttpsError("invalid-argument", "求人画像が正しくありません。");
        }
        if (key === "contactPhone") {
          try { changes[key] = normalizeContactPhone(value); } catch { throw new HttpsError("invalid-argument", "contactPhone is invalid."); }
          continue;
        }
        if (key === "contactEmail") {
          try { changes[key] = normalizeContactEmail(value); } catch { throw new HttpsError("invalid-argument", "contactEmail is invalid."); }
          continue;
        }
        changes[key] = value;
      }
      if (typeof changes.title !== "string" || !changes.title.trim()) {
        throw new HttpsError("invalid-argument", "求人タイトルを入力してください。");
      }
      changes = { ...changes, ...canonicalJobCompatibilityChanges({ ...before, ...changes }) };
      changes.isPublic = changes.status === "approved" && (before.listingSource === "public_info" || before.contractListingStatus === "active");
    } else if (action === "pause") {
      changes = { status: "paused", isPublic: false, pausedAt: FieldValue.serverTimestamp(), pausedBy: admin.uid };
    } else if (action === "resume") {
      if (before.listingSource !== "public_info" && before.contractListingStatus !== "active") {
        throw new HttpsError("failed-precondition", "店舗契約が掲載中ではないため再開できません。");
      }
      changes = { status: "approved", isPublic: true, pausedAt: null, pausedBy: null };
    } else if (action === "end") {
      changes = { status: "archived", isPublic: false, archivedAt: FieldValue.serverTimestamp(), archivedBy: admin.uid };
    } else if (action === "top-on" || action === "top-off") {
      if (action === "top-on" && (before.status !== "approved" || before.isPublic !== true)) {
        throw new HttpsError("failed-precondition", "公開中の求人だけをTOP掲載に設定できます。");
      }
      changes = { topFeatured: action === "top-on", topFeaturedChangedAt: FieldValue.serverTimestamp() };
    } else {
      throw new HttpsError("invalid-argument", "未対応の求人操作です。");
    }

    changes.updatedAt = FieldValue.serverTimestamp();
    changes.updatedBy = admin.uid;
    transaction.update(jobRef, changes);
    transaction.create(auditRef, createAdminAuditLogDraft(admin, {
      action: `job_${action}`, targetType: "job", targetId: jobId,
      before: safeSummary(before), after: safeSummary({ ...before, ...changes }),
    }));
    return { success: true, action, jobId };
  });
});
