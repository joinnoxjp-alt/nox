import { HttpsError, onCall } from "firebase-functions/v2/https";
import { publicCallableOptions } from "../config";
import { firestore } from "../firebaseAdmin";
import { composePublicCustomerPage, isCustomerPagePublic } from "../domain/storeCustomerPage";

function storeId(value: unknown) { const id = typeof value === "string" ? value.trim() : ""; if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new HttpsError("invalid-argument", "店舗IDが不正です。"); return id; }
function publicJob(data: FirebaseFirestore.DocumentData) { return data.status === "approved" && data.isPublic === true && data.contractListingStatus === "active"; }

export const getPublicStoreCustomerPage = onCall(publicCallableOptions, async (request) => {
  const id = storeId(request.data?.storeId);
  const [storeSnapshot, pageSnapshot, gallerySnapshot, jobsSnapshot] = await Promise.all([
    firestore.doc(`stores/${id}`).get(), firestore.doc(`storeCustomerPages/${id}`).get(),
    firestore.collection(`stores/${id}/galleryImages`).limit(10).get(), firestore.collection("jobs").where("storeId", "==", id).limit(20).get(),
  ]);
  const page = pageSnapshot.data() ?? {};
  if (!storeSnapshot.exists || !pageSnapshot.exists || !isCustomerPagePublic(page)) throw new HttpsError("not-found", "店舗ページは公開されていません。");
  const jobs = jobsSnapshot.docs.filter((doc) => publicJob(doc.data())).map((doc) => ({ jobId: doc.id, title: String(doc.data().title || doc.data().jobTitle || "求人情報") }));
  const fallbackGallery = gallerySnapshot.docs.sort((a, b) => Number(a.id) - Number(b.id)).map((doc) => String(doc.data().url || "")).filter(Boolean);
  return { page: composePublicCustomerPage(id, storeSnapshot.data() ?? {}, page, fallbackGallery), jobs };
});

export const getPublicCustomerStores = onCall(publicCallableOptions, async () => {
  const pages = await firestore.collection("storeCustomerPages").where("enabled", "==", true).limit(100).get();
  const published = pages.docs.filter((doc) => doc.data().status === "published");
  const stores = await Promise.all(published.map(async (pageDoc) => {
    const store = await firestore.doc(`stores/${pageDoc.id}`).get();
    return store.exists ? composePublicCustomerPage(pageDoc.id, store.data() ?? {}, pageDoc.data(), []) : null;
  }));
  return { stores: stores.filter(Boolean) };
});
