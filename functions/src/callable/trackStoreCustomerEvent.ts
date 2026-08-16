import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { publicCallableOptions } from "../config";
import { firestore } from "../firebaseAdmin";
import { isCustomerPagePublic } from "../domain/storeCustomerPage";
const EVENTS = new Set(["page_view", "job_to_store", "reservation_form_view", "reservation_click", "line_click", "phone_click", "external_click"]);
function day() { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date()); }
export const trackStoreCustomerEvent = onCall(publicCallableOptions, async (request) => {
  const storeId = typeof request.data?.storeId === "string" ? request.data.storeId.trim() : "", eventType = typeof request.data?.eventType === "string" ? request.data.eventType : "";
  const eventId = typeof request.data?.eventId === "string" ? request.data.eventId.slice(0, 128) : "";
  const visitorId = typeof request.data?.visitorId === "string" ? request.data.visitorId.slice(0, 128) : "";
  if (!/^[A-Za-z0-9_-]+$/.test(storeId) || !EVENTS.has(eventType) || !eventId) throw new HttpsError("invalid-argument", "計測値が不正です。");
  const page = await firestore.doc(`storeCustomerPages/${storeId}`).get();
  if (!page.exists || !isCustomerPagePublic(page.data() ?? {})) throw new HttpsError("not-found", "店舗ページは公開されていません。");
  const key = createHash("sha256").update(`${day()}|${storeId}|${eventType}|${eventId}`).digest("hex");
  await firestore.runTransaction(async (transaction) => {
    const dedupe = firestore.doc(`storeCustomerEventDedupe/${key}`);
    const visitorKey = visitorId ? createHash("sha256").update(`${day()}|${storeId}|visitor|${visitorId}`).digest("hex") : "";
    const visitorDedupe = visitorKey ? firestore.doc(`storeCustomerEventDedupe/${visitorKey}`) : null;
    const [eventSnapshot, visitorSnapshot] = await Promise.all([transaction.get(dedupe), visitorDedupe ? transaction.get(visitorDedupe) : Promise.resolve(null)]);
    if (eventSnapshot.exists) return;
    transaction.create(dedupe, { storeId, eventType, dateKey: day(), createdAt: FieldValue.serverTimestamp() });
    transaction.set(firestore.doc(`storeCustomerDaily/${day()}_${storeId}`), { dateKey: day(), storeId, [eventType]: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (eventType === "page_view" && visitorDedupe && visitorSnapshot && !visitorSnapshot.exists) {
      transaction.create(visitorDedupe, { storeId, eventType: "page_uu", dateKey: day(), createdAt: FieldValue.serverTimestamp() });
      transaction.set(firestore.doc(`storeCustomerDaily/${day()}_${storeId}`), { page_uu: FieldValue.increment(1) }, { merge: true });
    }
  });
  return { success: true };
});
