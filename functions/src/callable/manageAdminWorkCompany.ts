import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { adminCallableOptions } from "../config";
import { firestore } from "../firebaseAdmin";
import { parseWorkCompany } from "../domain/adminWorkInput";
import { assertActiveAdmin } from "../security/adminAuthorization";

export const manageAdminWorkCompany = onCall(adminCallableOptions, async (request) => {
  const admin = await assertActiveAdmin(request.auth);
  const data = request.data as Record<string, unknown> | null;
  const action = typeof data?.action === "string" ? data.action : "";
  if (action === "save") {
    const input = parseWorkCompany(data?.company);
    const ref = input.companyId ? firestore.doc(`workCompanies/${input.companyId}`) : firestore.collection("workCompanies").doc();
    const batch = firestore.batch(), audit = firestore.collection("adminAuditLogs").doc();
    batch.set(ref, { ...input, companyId: ref.id, updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid,
      ...(!input.companyId ? { createdAt: FieldValue.serverTimestamp(), createdBy: admin.uid } : {}) }, { merge: true });
    batch.create(audit, { actionType: "work_company_saved", targetType: "workCompany", targetHash: ref.id, createdAt: FieldValue.serverTimestamp(), actorType: "fixed_admin" });
    await batch.commit();
    return { success: true, companyId: ref.id };
  }
  if (action === "delete") {
    const companyId = typeof data?.companyId === "string" ? data.companyId.trim() : "";
    if (!companyId) throw new HttpsError("invalid-argument", "企業IDが必要です。");
    const jobs = await firestore.collection("workJobs").where("companyId", "==", companyId).limit(1).get();
    if (!jobs.empty) throw new HttpsError("failed-precondition", "求人が紐付いている企業は削除できません。");
    const batch = firestore.batch();
    batch.delete(firestore.doc(`workCompanies/${companyId}`));
    batch.create(firestore.collection("adminAuditLogs").doc(), { actionType: "work_company_deleted", targetType: "workCompany", targetHash: companyId, createdAt: FieldValue.serverTimestamp(), actorType: "fixed_admin" });
    await batch.commit();
    return { success: true, companyId };
  }
  throw new HttpsError("invalid-argument", "操作が正しくありません。");
});
