import { createHash, randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { publicCallableOptions } from "../config";
import { firestore } from "../firebaseAdmin";
import { isCustomerPagePublic } from "../domain/storeCustomerPage";
import { buildReservationRecord, optionalDocumentId } from "../domain/storeReservation";

function text(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function jstDate() { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date()); }
export const submitStoreReservation = onCall({ ...publicCallableOptions, memory: "256MiB", timeoutSeconds: 30 }, async (request) => {
  const data = request.data ?? {};
  if (text(data.website, 100)) throw new HttpsError("invalid-argument", "送信できませんでした。");
  const storeId = text(data.storeId, 128), name = text(data.name, 100), phone = text(data.phone, 100), desiredDate = text(data.desiredDate, 10), desiredTime = text(data.desiredTime, 10);
  const people = Number(data.people);
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(desiredDate) ? new Date(`${desiredDate}T00:00:00Z`) : null;
  const validDate = parsedDate !== null && !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === desiredDate;
  if (!/^[A-Za-z0-9_-]+$/.test(storeId) || !name || phone.replace(/\D/g, "").length < 7 || !validDate || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(desiredTime) || !Number.isInteger(people) || people < 1 || people > 30) throw new HttpsError("invalid-argument", "必須項目を確認してください。");
  const jobId = optionalDocumentId(data.jobId);
  if (text(data.jobId, 128) && !jobId) throw new HttpsError("invalid-argument", "求人IDが不正です。");
  const [page, store, job] = await Promise.all([
    firestore.doc(`storeCustomerPages/${storeId}`).get(),
    firestore.doc(`stores/${storeId}`).get(),
    jobId ? firestore.doc(`jobs/${jobId}`).get() : Promise.resolve(null),
  ]);
  const pageData = page.data() ?? {};
  if (!page.exists || !isCustomerPagePublic(pageData) || pageData.reservationFormEnabled !== true) throw new HttpsError("failed-precondition", "現在フォーム予約を受け付けていません。");
  if (!store.exists) throw new HttpsError("not-found", "店舗情報を確認できませんでした。");
  if (job && (!job.exists || ![job.data()?.storeId, job.data()?.ownerId].includes(storeId))) throw new HttpsError("invalid-argument", "求人情報を確認できませんでした。");
  const requestId = text(data.requestId, 128) || randomUUID();
  const dedupeId = createHash("sha256").update(`${storeId}|${requestId}`).digest("hex");
  const ref = firestore.collection("storeReservations").doc();
  await firestore.runTransaction(async (transaction) => {
    const dedupe = firestore.doc(`storeReservationDedupe/${dedupeId}`), existing = await transaction.get(dedupe);
    if (existing.exists) throw new HttpsError("already-exists", "この予約は送信済みです。");
    transaction.create(ref, {
      ...buildReservationRecord({ reservationId: ref.id, storeId, storeName: text(pageData.storeName, 160) || text(store.data()?.storeName ?? store.data()?.name, 160), jobId, name, phone, desiredDate, desiredTime, people, content: data.content, notes: data.notes, page: pageData }),
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(dedupe, { storeId, reservationId: ref.id, createdAt: FieldValue.serverTimestamp() });
    transaction.set(firestore.doc(`storeCustomerDaily/${jstDate()}_${storeId}`), { dateKey: jstDate(), storeId, reservationForms: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return { success: true, reservationId: ref.id };
});
