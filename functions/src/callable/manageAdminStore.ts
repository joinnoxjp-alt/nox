import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { createAdminAuditLogDraft } from "../audit/adminAudit";
import { adminCallableOptions } from "../config";
import { firestore } from "../firebaseAdmin";
import { assertActiveAdmin } from "../security/adminAuthorization";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "店舗の操作内容が正しくありません。");
  }
  return value as Record<string, unknown>;
}
function required(value: unknown, max = 160): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new HttpsError("invalid-argument", "必須項目を確認してください。");
  }
  return value.trim();
}
function optional(value: unknown, max = 500): string {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > max) {
    throw new HttpsError("invalid-argument", "入力内容が長すぎます。");
  }
  return value.trim();
}
function date(value: unknown): Timestamp {
  const milliseconds = Date.parse(required(value, 40));
  if (!Number.isFinite(milliseconds)) throw new HttpsError("invalid-argument", "契約日が正しくありません。");
  return Timestamp.fromMillis(milliseconds);
}

export const manageAdminStore = onCall(adminCallableOptions, async (request) => {
  const admin = await assertActiveAdmin(request.auth);
  const input = object(request.data);
  const action = required(input.action, 20);
  const storeId = required(input.storeId, 128);
  const storeRef = firestore.doc(`stores/${storeId}`);
  const contractRef = firestore.doc(`storeContracts/${storeId}`);
  const auditRef = firestore.collection("adminAuditLogs").doc();

  if (action === "create") {
    const startAt = date(input.contractStartAt);
    const endAt = date(input.contractEndAt);
    if (endAt.toMillis() < startAt.toMillis()) throw new HttpsError("invalid-argument", "契約終了日は開始日以降にしてください。");
    const planCode = required(input.planCode, 40);
    const paymentStatus = required(input.paymentStatus, 40);
    if (!["one_month", "six_months", "twelve_months"].includes(planCode) ||
        !["not_billed", "awaiting_payment", "paid"].includes(paymentStatus)) {
      throw new HttpsError("invalid-argument", "契約プランまたは支払状態が正しくありません。");
    }
    const listingStatus = paymentStatus === "paid" ? "active" : "pending";
    const optionCodes = Array.isArray(input.optionCodes) ? input.optionCodes.filter((v): v is string => v === "top_ad" || v === "new_job") : [];
    const catalogSnapshot = await firestore.doc("pricingCatalog/current").get();
    const catalog = catalogSnapshot.data() ?? {};
    const planField: Record<string, string> = { one_month: "oneMonth", six_months: "sixMonths", twelve_months: "twelveMonths" };
    const plan = catalog.listingPlans?.[planField[planCode]];
    if (!catalogSnapshot.exists || catalog.status !== "active" || !plan) throw new HttpsError("failed-precondition", "料金カタログを確認できません。");
    const optionField: Record<string, string> = { top_ad: "topAd", new_job: "newJob" };
    const options = Object.fromEntries(optionCodes.map((code) => [code, { ...catalog.options?.[optionField[code]], enabled: true }]));
    const optionAmount = optionCodes.reduce((sum, code) => sum + Number(catalog.options?.[optionField[code]]?.amount ?? 0), 0);
    const now = Timestamp.now();
    const isPublic = paymentStatus === "paid" && startAt.toMillis() <= now.toMillis() && endAt.toMillis() >= now.toMillis();
    const storeData = {
      storeName: required(input.storeName, 120), ownerId: storeId,
      businessScope: required(input.businessScope, 20), businessType: optional(input.businessType, 120),
      area: optional(input.area, 120), contactName: optional(input.contactName, 120),
      isPublic, contractListingStatus: listingStatus, contractEndAt: endAt,
      source: "admin_direct", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    };
    if (!["night", "general", "both"].includes(storeData.businessScope)) {
      throw new HttpsError("invalid-argument", "掲載区分が正しくありません。");
    }
    const contractData = {
      schemaVersion: 1, storeId, ownerId: storeId, planCode, planLabel: plan.label,
      durationMonths: plan.durationMonths, contractStartAt: startAt, contractEndAt: endAt,
      listingAmount: Number(plan.amount ?? 0), options, optionAmount,
      totalAmount: Number(plan.amount ?? 0) + optionAmount, currency: "JPY", taxIncluded: true,
      billingMethod: "prepaid", paymentStatus, listingStatus,
      pricingCatalogVersion: catalog.schemaVersion, pricingEffectiveFrom: catalog.effectiveFrom,
      adminNote: optional(input.adminNote, 500), createdAt: FieldValue.serverTimestamp(), createdBy: admin.uid,
      updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid, statusChangedAt: FieldValue.serverTimestamp(),
    };
    await firestore.runTransaction(async (transaction) => {
      if ((await transaction.get(storeRef)).exists) throw new HttpsError("already-exists", "同じUIDの店舗が既にあります。");
      transaction.create(storeRef, storeData); transaction.create(contractRef, contractData);
      transaction.create(auditRef, createAdminAuditLogDraft(admin, { action: "store_created", targetType: "store", targetId: storeId, after: { storeName: storeData.storeName, isPublic } }));
    });
    return { success: true, action, storeId };
  }

  if (action === "update") {
    const changes = object(input.changes);
    const allowed = new Set(["storeName", "businessScope", "businessType", "area", "contactName", "ownerName", "email", "phone", "line", "instagram", "description"]);
    if (Object.keys(changes).some((key) => !allowed.has(key))) throw new HttpsError("invalid-argument", "変更できない店舗項目が含まれています。");
    const storeSnapshot = await storeRef.get();
    if (!storeSnapshot.exists) throw new HttpsError("not-found", "対象の店舗が見つかりません。");
    const ownerId = required(storeSnapshot.data()?.ownerId, 128);
    const jobs = await firestore.collection("jobs").where("ownerId", "==", ownerId).get();
    if (jobs.size > 400) throw new HttpsError("failed-precondition", "求人件数が多いため店舗を更新できません。");
    changes.updatedAt = FieldValue.serverTimestamp();
    const batch = firestore.batch();
    batch.update(storeRef, changes);
    if (typeof changes.storeName === "string") {
      jobs.forEach((job) => batch.update(job.ref, {
        storeName: changes.storeName,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: admin.uid,
      }));
    }
    batch.create(auditRef, createAdminAuditLogDraft(admin, {
      action: "store_updated", targetType: "store", targetId: storeId,
      before: { storeName: storeSnapshot.data()?.storeName ?? null },
      after: { storeName: changes.storeName ?? storeSnapshot.data()?.storeName ?? null },
    }));
    await batch.commit();
    return { success: true, action, storeId, synchronizedJobCount: typeof changes.storeName === "string" ? jobs.size : 0 };
  }

  if (action === "delete") {
    const storeSnapshot = await storeRef.get();
    if (!storeSnapshot.exists) throw new HttpsError("not-found", "対象の店舗が見つかりません。");
    const ownerId = required(storeSnapshot.data()?.ownerId, 128);
    const jobs = await firestore.collection("jobs").where("ownerId", "==", ownerId).get();
    if (jobs.size > 400) throw new HttpsError("failed-precondition", "求人件数が多いため店舗を削除できません。");
    const batch = firestore.batch();
    jobs.forEach((job) => batch.update(job.ref, { status: "archived", isPublic: false, archivedAt: FieldValue.serverTimestamp(), archivedBy: admin.uid }));
    batch.delete(storeRef); batch.delete(contractRef);
    batch.create(auditRef, createAdminAuditLogDraft(admin, { action: "store_deleted", targetType: "store", targetId: storeId, after: { archivedJobCount: jobs.size } }));
    await batch.commit();
    return { success: true, action, storeId, archivedJobCount: jobs.size };
  }
  throw new HttpsError("invalid-argument", "未対応の店舗操作です。");
});
