import { onCall } from "firebase-functions/v2/https";
import { adminCallableOptions } from "../config";
import { firestore } from "../firebaseAdmin";
import { assertActiveAdmin } from "../security/adminAuthorization";

function clean(id: string, data: FirebaseFirestore.DocumentData) { const copy = { ...data }; delete copy.adminNote; return { id, ...copy }; }
export const getAdminStoreCustomerData = onCall(adminCallableOptions, async (request) => {
  await assertActiveAdmin(request.auth);
  const [stores, pages, reservations, daily] = await Promise.all([
    firestore.collection("stores").limit(500).get(), firestore.collection("storeCustomerPages").limit(500).get(),
    firestore.collection("storeReservations").orderBy("createdAt", "desc").limit(200).get(),
    firestore.collection("storeCustomerDaily").orderBy("dateKey", "desc").limit(1000).get(),
  ]);
  return { stores: stores.docs.map((doc) => clean(doc.id, doc.data())), pages: pages.docs.map((doc) => clean(doc.id, doc.data())), reservations: reservations.docs.map((doc) => clean(doc.id, doc.data())), daily: daily.docs.map((doc) => clean(doc.id, doc.data())) };
});
