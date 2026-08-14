import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { adminCallableOptions } from "../config";
import { firestore } from "../firebaseAdmin";
import { parseWorkJob, WORK_JOB_STATUSES } from "../domain/adminWorkInput";
import { assertActiveAdmin } from "../security/adminAuthorization";

export const manageAdminWorkJob = onCall(adminCallableOptions, async (request) => {
  const admin = await assertActiveAdmin(request.auth);
  const data = request.data as Record<string, unknown> | null;
  const action = typeof data?.action === "string" ? data.action : "";
  if (action === "save") {
    const input = parseWorkJob(data?.job);
    const company = await firestore.doc(`workCompanies/${input.companyId}`).get();
    if (!company.exists || company.data()?.name !== input.companyName) throw new HttpsError("failed-precondition", "企業情報が一致しません。");
    if (input.publishStartDate && input.publishEndDate && input.publishStartDate > input.publishEndDate) throw new HttpsError("invalid-argument", "掲載期間が正しくありません。");
    const ref = input.jobId ? firestore.doc(`workJobs/${input.jobId}`) : firestore.collection("workJobs").doc();
    const batch = firestore.batch();
    batch.set(ref, { ...input, jobId: ref.id, schemaVersion: 1, isPublic: input.status === "published",
      updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid,
      ...(!input.jobId ? { createdAt: FieldValue.serverTimestamp(), createdBy: admin.uid } : {}) }, { merge: true });
    batch.create(firestore.collection("adminAuditLogs").doc(), { actionType: "work_job_saved", targetType: "workJob", targetHash: ref.id, createdAt: FieldValue.serverTimestamp(), actorType: "fixed_admin" });
    await batch.commit();
    return { success: true, jobId: ref.id };
  }
  const jobId = typeof data?.jobId === "string" ? data.jobId.trim() : "";
  if (!jobId) throw new HttpsError("invalid-argument", "求人IDが必要です。");
  const ref = firestore.doc(`workJobs/${jobId}`);
  if (action === "delete") {
    const batch = firestore.batch(); batch.delete(ref);
    batch.create(firestore.collection("adminAuditLogs").doc(), { actionType: "work_job_deleted", targetType: "workJob", targetHash: jobId, createdAt: FieldValue.serverTimestamp(), actorType: "fixed_admin" });
    await batch.commit(); return { success: true, jobId };
  }
  if (action === "status") {
    const status = typeof data?.status === "string" ? data.status : "";
    if (!WORK_JOB_STATUSES.has(status)) throw new HttpsError("invalid-argument", "公開状態が正しくありません。");
    const batch = firestore.batch();
    batch.update(ref, { status, isPublic: status === "published", updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid });
    batch.create(firestore.collection("adminAuditLogs").doc(), { actionType: `work_job_${status}`, targetType: "workJob", targetHash: jobId, createdAt: FieldValue.serverTimestamp(), actorType: "fixed_admin" });
    await batch.commit();
    return { success: true, jobId, status };
  }
  throw new HttpsError("invalid-argument", "操作が正しくありません。");
});
