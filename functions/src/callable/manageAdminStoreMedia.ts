import { randomUUID } from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { createAdminAuditLogDraft } from "../audit/adminAudit";
import { adminCallableOptions } from "../config";
import {
  executeAdminStoreMedia,
  StoreMediaDependencies,
  StoreMediaError,
  StoreMediaInput,
  StoreMediaKind,
} from "../domain/adminStoreMedia";
import { firestore, getStorageBucket } from "../firebaseAdmin";
import { assertActiveAdmin } from "../security/adminAuthorization";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "店舗画像の操作内容が正しくありません。");
  }
  return value as Record<string, unknown>;
}

function requestInput(value: unknown): StoreMediaInput {
  const input = record(value);
  const operation = input.operation;
  const commonKeys = new Set(["operation", "storeId", "kind", "slot"]);
  const allowedKeys = operation === "upload"
    ? new Set([...commonKeys, "fileName", "contentType", "imageBase64"])
    : commonKeys;
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new HttpsError("invalid-argument", "許可されていない入力項目が含まれています。");
  }
  return {
    operation: operation as StoreMediaInput["operation"],
    storeId: typeof input.storeId === "string" ? input.storeId.trim() : "",
    kind: input.kind as StoreMediaKind,
    slot: typeof input.slot === "number" ? input.slot : undefined,
    fileName: typeof input.fileName === "string" ? input.fileName : undefined,
    contentType: typeof input.contentType === "string" ? input.contentType : undefined,
    imageBase64: typeof input.imageBase64 === "string" ? input.imageBase64 : undefined,
  };
}

function singleFields(kind: Exclude<StoreMediaKind, "gallery">): { url: string; path: string } {
  return {
    logo: { url: "logoUrl", path: "logoStoragePath" },
    cover: { url: "coverImageUrl", path: "coverImageStoragePath" },
    profile: { url: "profileImageUrl", path: "profileImageStoragePath" },
  }[kind];
}

function auditDetails(kind: StoreMediaKind, operation: string, slot?: number): Record<string, unknown> {
  return { imageKind: kind, operation, ...(slot === undefined ? {} : { slot }) };
}

const dependencies: StoreMediaDependencies = {
  async getStore(storeId) {
    const snapshot = await firestore.doc(`stores/${storeId}`).get();
    return snapshot.exists ? snapshot.data() ?? {} : null;
  },
  async getGalleryImage(storeId, slot) {
    const snapshot = await firestore.doc(`stores/${storeId}/galleryImages/${slot}`).get();
    const data = snapshot.data();
    return snapshot.exists && typeof data?.storagePath === "string"
      ? { url: typeof data.url === "string" ? data.url : "", storagePath: data.storagePath }
      : null;
  },
  async saveImage(input) {
    const storageBucket = getStorageBucket();
    const token = randomUUID();
    await storageBucket.file(input.path).save(input.bytes, {
      resumable: false,
      metadata: {
        contentType: input.contentType,
        cacheControl: "public,max-age=3600",
        metadata: { ...input.metadata, firebaseStorageDownloadTokens: token },
      },
    });
    return `https://firebasestorage.googleapis.com/v0/b/${storageBucket.name}/o/${encodeURIComponent(input.path)}?alt=media&token=${token}`;
  },
  async deleteImage(path) {
    const storageBucket = getStorageBucket();
    try {
      await storageBucket.file(path).delete();
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code !== 404) throw error;
    }
  },
  async writeMedia(input) {
    const storeRef = firestore.doc(`stores/${input.storeId}`);
    const galleryRef = input.kind === "gallery"
      ? firestore.doc(`stores/${input.storeId}/galleryImages/${input.slot}`)
      : null;
    await firestore.runTransaction(async (transaction) => {
      const storeSnapshot = await transaction.get(storeRef);
      if (!storeSnapshot.exists) throw new HttpsError("not-found", "対象の店舗が見つかりません。");
      const gallerySnapshot = galleryRef ? await transaction.get(galleryRef) : null;
      const fields = input.kind === "gallery" ? null : singleFields(input.kind);
      const currentPath = gallerySnapshot
        ? gallerySnapshot.data()?.storagePath
        : fields ? storeSnapshot.data()?.[fields.path] : undefined;
      if ((typeof currentPath === "string" ? currentPath : "") !== (input.previous?.storagePath ?? "")) {
        throw new HttpsError("aborted", "別の画像操作が先に完了しました。画面を更新して再試行してください。");
      }
      if (galleryRef) {
        transaction.set(galleryRef, {
          url: input.media.url,
          storagePath: input.media.storagePath,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.update(storeRef, { mediaUpdatedAt: FieldValue.serverTimestamp() });
      } else if (fields) {
        transaction.update(storeRef, {
          [fields.url]: input.media.url,
          [fields.path]: input.media.storagePath,
          mediaUpdatedAt: FieldValue.serverTimestamp(),
        });
      }
      transaction.create(firestore.collection("adminAuditLogs").doc(), createAdminAuditLogDraft(input.admin, {
        action: `store_media_${input.action}`,
        targetType: "store",
        targetId: input.storeId,
        before: { ...auditDetails(input.kind, input.action, input.slot), storagePath: input.previous?.storagePath ?? null },
        after: { ...auditDetails(input.kind, input.action, input.slot), storagePath: input.media.storagePath },
      }));
    });
  },
  async clearMedia(input) {
    const storeRef = firestore.doc(`stores/${input.storeId}`);
    const galleryRef = input.kind === "gallery"
      ? firestore.doc(`stores/${input.storeId}/galleryImages/${input.slot}`)
      : null;
    await firestore.runTransaction(async (transaction) => {
      const storeSnapshot = await transaction.get(storeRef);
      if (!storeSnapshot.exists) throw new HttpsError("not-found", "対象の店舗が見つかりません。");
      const gallerySnapshot = galleryRef ? await transaction.get(galleryRef) : null;
      const fields = input.kind === "gallery" ? null : singleFields(input.kind);
      const currentPath = gallerySnapshot
        ? gallerySnapshot.data()?.storagePath
        : fields ? storeSnapshot.data()?.[fields.path] : undefined;
      if (currentPath !== input.previous.storagePath) {
        throw new HttpsError("aborted", "別の画像操作が先に完了しました。画面を更新して再試行してください。");
      }
      if (galleryRef) {
        transaction.delete(galleryRef);
        transaction.update(storeRef, { mediaUpdatedAt: FieldValue.serverTimestamp() });
      } else if (fields) {
        transaction.update(storeRef, {
          [fields.url]: "",
          [fields.path]: "",
          mediaUpdatedAt: FieldValue.serverTimestamp(),
        });
      }
      transaction.create(firestore.collection("adminAuditLogs").doc(), createAdminAuditLogDraft(input.admin, {
        action: "store_media_deleted",
        targetType: "store",
        targetId: input.storeId,
        before: { ...auditDetails(input.kind, "deleted", input.slot), storagePath: input.previous.storagePath },
      }));
    });
  },
  async restoreMedia(input) {
    const storeRef = firestore.doc(`stores/${input.storeId}`);
    const galleryRef = input.kind === "gallery"
      ? firestore.doc(`stores/${input.storeId}/galleryImages/${input.slot}`)
      : null;
    return firestore.runTransaction(async (transaction) => {
      const storeSnapshot = await transaction.get(storeRef);
      if (!storeSnapshot.exists) return false;
      const gallerySnapshot = galleryRef ? await transaction.get(galleryRef) : null;
      const fields = input.kind === "gallery" ? null : singleFields(input.kind);
      const currentPath = gallerySnapshot
        ? gallerySnapshot.data()?.storagePath
        : fields ? storeSnapshot.data()?.[fields.path] : undefined;
      if (typeof currentPath === "string" && currentPath) return false;
      if (galleryRef) {
        transaction.set(galleryRef, {
          url: input.previous.url,
          storagePath: input.previous.storagePath,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.update(storeRef, { mediaUpdatedAt: FieldValue.serverTimestamp() });
      } else if (fields) {
        transaction.update(storeRef, {
          [fields.url]: input.previous.url,
          [fields.path]: input.previous.storagePath,
          mediaUpdatedAt: FieldValue.serverTimestamp(),
        });
      }
      transaction.create(firestore.collection("adminAuditLogs").doc(), createAdminAuditLogDraft(input.admin, {
        action: "store_media_delete_restored",
        targetType: "store",
        targetId: input.storeId,
        after: { ...auditDetails(input.kind, "delete_restored", input.slot), storagePath: input.previous.storagePath },
      }));
      return true;
    });
  },
};

export async function handleManageAdminStoreMedia(
  request: { auth?: Parameters<typeof assertActiveAdmin>[0]; data: unknown },
  overrides?: { authorize?: typeof assertActiveAdmin; media?: StoreMediaDependencies },
) {
  const admin = await (overrides?.authorize ?? assertActiveAdmin)(request.auth);
  try {
    return await executeAdminStoreMedia(requestInput(request.data), admin, overrides?.media ?? dependencies);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof StoreMediaError) throw new HttpsError(error.code, error.message);
    throw new HttpsError("internal", "店舗画像の操作に失敗しました。");
  }
}

export const manageAdminStoreMedia = onCall(
  { ...adminCallableOptions, memory: "512MiB", timeoutSeconds: 120 },
  (request) => handleManageAdminStoreMedia(request),
);
