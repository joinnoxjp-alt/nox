import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { adminCallableOptions } from "../config";
import { parseStoreCustomerPage } from "../domain/storeCustomerPage";
import { firestore } from "../firebaseAdmin";
import { assertActiveAdmin } from "../security/adminAuthorization";

export const manageAdminStoreCustomerPage = onCall(adminCallableOptions, async (request) => {
  const admin = await assertActiveAdmin(request.auth);
  const action = typeof request.data?.action === "string" ? request.data.action : "";
  if (action === "save") {
    let input; try { input = parseStoreCustomerPage(request.data?.page); } catch (error) { throw new HttpsError("invalid-argument", (error as Error).message); }
    const store = await firestore.doc(`stores/${input.storeId}`).get();
    if (!store.exists) throw new HttpsError("not-found", "店舗が存在しません。");
    const ref = firestore.doc(`storeCustomerPages/${input.storeId}`);
    const previous = await ref.get();
    const batch = firestore.batch();
    batch.set(ref, { ...input, updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid, ...(!previous.exists ? { createdAt: FieldValue.serverTimestamp(), createdBy: admin.uid } : {}) }, { merge: true });
    batch.create(firestore.collection("adminAuditLogs").doc(), { actionType: "store_customer_page_saved", targetType: "storeCustomerPage", targetHash: input.storeId, createdAt: FieldValue.serverTimestamp(), actorType: "fixed_admin" });
    await batch.commit();
    return { success: true, storeId: input.storeId };
  }
  if (action === "reservationStatus") {
    const reservationId = typeof request.data?.reservationId === "string" ? request.data.reservationId.trim() : "";
    const status = typeof request.data?.status === "string" ? request.data.status : "";
    if (!/^[A-Za-z0-9_-]+$/.test(reservationId) || !["new", "in_progress", "confirmed", "visited", "cancelled", "invalid"].includes(status)) throw new HttpsError("invalid-argument", "予約状態が不正です。");
    await firestore.doc(`storeReservations/${reservationId}`).update({ status, updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid });
    return { success: true };
  }
  throw new HttpsError("invalid-argument", "操作が不正です。");
});
