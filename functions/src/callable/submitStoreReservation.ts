import { createHash, randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { publicCallableOptions } from "../config";
import { firestore } from "../firebaseAdmin";
import { isCustomerPagePublic } from "../domain/storeCustomerPage";

function text(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function jstDate() { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date()); }
export const submitStoreReservation = onCall({ ...publicCallableOptions, memory: "256MiB", timeoutSeconds: 30 }, async (request) => {
  const data = request.data ?? {};
  if (text(data.website, 100)) throw new HttpsError("invalid-argument", "送信できませんでした。");
  const storeId = text(data.storeId, 128), name = text(data.name, 100), phone = text(data.phone, 100), desiredDate = text(data.desiredDate, 10), desiredTime = text(data.desiredTime, 10);
  const people = Number(data.people);
  if (!/^[A-Za-z0-9_-]+$/.test(storeId) || !name || phone.replace(/\D/g, "").length < 7 || !/^\d{4}-\d{2}-\d{2}$/.test(desiredDate) || !desiredTime || !Number.isInteger(people) || people < 1 || people > 30) throw new HttpsError("invalid-argument", "必須項目を確認してください。");
  const page = await firestore.doc(`storeCustomerPages/${storeId}`).get();
  if (!page.exists || !isCustomerPagePublic(page.data() ?? {}) || page.data()?.reservationFormEnabled !== true) throw new HttpsError("failed-precondition", "現在フォーム予約を受け付けていません。");
  const requestId = text(data.requestId, 128) || randomUUID();
  const dedupeId = createHash("sha256").update(`${storeId}|${requestId}`).digest("hex");
  const ref = firestore.collection("storeReservations").doc();
  await firestore.runTransaction(async (transaction) => {
    const dedupe = firestore.doc(`storeReservationDedupe/${dedupeId}`), existing = await transaction.get(dedupe);
    if (existing.exists) throw new HttpsError("already-exists", "この予約は送信済みです。");
    transaction.create(ref, { storeId, name, phone, desiredDate, desiredTime, people, content: text(data.content, 1000), notes: text(data.notes, 1000), status: "new", source: "nox_form", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    transaction.create(dedupe, { storeId, reservationId: ref.id, createdAt: FieldValue.serverTimestamp() });
    transaction.set(firestore.doc(`storeCustomerDaily/${jstDate()}_${storeId}`), { dateKey: jstDate(), storeId, reservationForms: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return { success: true, reservationId: ref.id };
});
