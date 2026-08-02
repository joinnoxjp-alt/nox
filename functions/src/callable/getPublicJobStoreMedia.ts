import { HttpsError, onCall } from "firebase-functions/v2/https";
import { error as logError } from "firebase-functions/logger";

import { publicCallableOptions } from "../config";
import {
  loadPublicJobStoreMedia,
  PublicJobStoreMediaError,
} from "../domain/publicJobStoreMedia";
import { firestore } from "../firebaseAdmin";

export const getPublicJobStoreMedia = onCall(
  {
    ...publicCallableOptions,
    memory: "256MiB",
    timeoutSeconds: 30,
    maxInstances: 10,
    concurrency: 40,
  },
  async (request) => {
    const data = request.data;
    if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).length !== 1) {
      throw new HttpsError("invalid-argument", "The request is invalid.");
    }
    const jobId = (data as Record<string, unknown>).jobId;
    try {
      return await loadPublicJobStoreMedia(
        typeof jobId === "string" ? jobId.trim() : "",
        {
          async getJob(id) {
            const snapshot = await firestore.doc(`jobs/${id}`).get();
            return snapshot.exists ? snapshot.data() ?? {} : null;
          },
          async getStore(storeId) {
            const snapshot = await firestore.doc(`stores/${storeId}`).get();
            return snapshot.exists ? snapshot.data() ?? {} : null;
          },
          async getGallery(storeId) {
            const snapshot = await firestore
              .collection(`stores/${storeId}/galleryImages`)
              .limit(10)
              .get();
            return snapshot.docs.map((document) => ({
              slot: document.id,
              url: document.data().url,
            }));
          },
        },
      );
    } catch (error) {
      if (error instanceof PublicJobStoreMediaError) {
        throw new HttpsError(error.code, error.message);
      }
      logError("Public job store media lookup failed.", {
        reason: "backend-read-failed",
      });
      throw new HttpsError("internal", "Store media could not be loaded.");
    }
  },
);
