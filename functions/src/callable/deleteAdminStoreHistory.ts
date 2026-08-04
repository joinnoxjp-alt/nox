import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { adminCallableOptions } from "../config";
import { firestore } from "../firebaseAdmin";
import { assertActiveAdmin } from "../security/adminAuthorization";
import {
  classifyAdminStoreHistory,
  parseAdminStoreHistoryInput,
} from "../domain/adminStoreHistory";

export const deleteAdminStoreHistory = onCall(adminCallableOptions, async (request) => {
  const admin = await assertActiveAdmin(request.auth);
  const input = parseAdminStoreHistoryInput(request.data);
  const historyRef = firestore.doc(`storeApplications/${input.historyId}`);
  const auditRef = firestore.collection("adminAuditLogs").doc();

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(historyRef);
    if (!snapshot.exists) return { success: true, removed: false, notFound: true };
    const data = snapshot.data() ?? {};
    if (data.adminHistoryHidden === true) {
      return { success: true, removed: false, alreadyRemoved: true };
    }
    if (classifyAdminStoreHistory(data) !== input.historyType) {
      throw new HttpsError("failed-precondition", "履歴の状態が変更されています。画面を再読み込みしてください。");
    }
    transaction.update(historyRef, {
      adminHistoryHidden: true,
      adminHistoryHiddenAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(auditRef, {
      adminUid: admin.uid,
      historyType: input.historyType,
      historyId: input.historyId,
      operatedAt: FieldValue.serverTimestamp(),
    });
    return { success: true, removed: true };
  });
});
