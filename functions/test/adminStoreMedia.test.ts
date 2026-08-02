import assert from "node:assert/strict";
import test from "node:test";

import { HttpsError } from "firebase-functions/v2/https";

import {
  executeAdminStoreMedia,
  StoreMediaAdmin,
  StoreMediaDependencies,
  StoreMediaError,
  StoreMediaInput,
  StoreMediaRecord,
} from "../src/domain/adminStoreMedia";
import { handleManageAdminStoreMedia } from "../src/callable/manageAdminStoreMedia";

const admin: StoreMediaAdmin = { uid: "admin-1", email: "admin@example.com" };
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function uploadInput(changes: Partial<StoreMediaInput> = {}): StoreMediaInput {
  return {
    operation: "upload",
    storeId: "store-1",
    kind: "logo",
    fileName: "logo.png",
    contentType: "image/png",
    imageBase64: png.toString("base64"),
    ...changes,
  };
}

function fakeDependencies(options: {
  store?: Record<string, unknown> | null;
  gallery?: StoreMediaRecord | null;
} = {}) {
  const state = {
    store: options.store === undefined ? {} : options.store,
    gallery: options.gallery ?? null,
    saved: [] as string[],
    deleted: [] as string[],
    writes: [] as Array<{ action: string; kind: string; slot?: number }>,
    clears: 0,
    restores: 0,
  };
  const dependencies: StoreMediaDependencies = {
    async getStore() { return state.store; },
    async getGalleryImage() { return state.gallery; },
    async saveImage(input) {
      state.saved.push(input.path);
      return `https://example.test/${encodeURIComponent(input.path)}`;
    },
    async deleteImage(path) { state.deleted.push(path); },
    async writeMedia(input) {
      state.writes.push({ action: input.action, kind: input.kind, slot: input.slot });
      if (input.kind === "gallery") state.gallery = input.media;
    },
    async clearMedia() { state.clears += 1; },
    async restoreMedia() { state.restores += 1; return true; },
    makeId: () => "generated-id",
  };
  return { state, dependencies };
}

async function expectMediaError(promise: Promise<unknown>, code: StoreMediaError["code"]) {
  await assert.rejects(promise, (error: unknown) => error instanceof StoreMediaError && error.code === code);
}

test("uploads one image to the dashboard-compatible logo path", async () => {
  const { state, dependencies } = fakeDependencies();
  const result = await executeAdminStoreMedia(uploadInput(), admin, dependencies);
  assert.equal(result.storagePath, "stores/store-1/logo/generated-id");
  assert.equal(result.replaced, false);
  assert.deepEqual(state.writes, [{ action: "uploaded", kind: "logo", slot: undefined }]);
  assert.deepEqual(state.deleted, []);
});

test("replaces an image and deletes the old owned Storage object", async () => {
  const oldPath = "stores/store-1/profile/old-id";
  const { state, dependencies } = fakeDependencies({
    store: { profileImageUrl: "https://old.test", profileImageStoragePath: oldPath },
  });
  const result = await executeAdminStoreMedia(uploadInput({ kind: "profile" }), admin, dependencies);
  assert.equal(result.replaced, true);
  assert.deepEqual(state.deleted, [oldPath]);
  assert.equal(state.writes[0]?.action, "replaced");
});

test("reports an old-object cleanup failure without deleting the active replacement", async () => {
  const oldPath = "stores/store-1/profile/old-id";
  const { dependencies } = fakeDependencies({
    store: { profileImageUrl: "https://old.test", profileImageStoragePath: oldPath },
  });
  dependencies.deleteImage = async (path) => {
    assert.equal(path, oldPath);
    throw new Error("storage-failed");
  };
  const result = await executeAdminStoreMedia(uploadInput({ kind: "profile" }), admin, dependencies);
  assert.equal(result.storagePath, "stores/store-1/profile/generated-id");
  assert.equal(result.oldStorageCleanupPending, true);
});

test("deletes gallery slot metadata and its owned Storage object", async () => {
  const oldPath = "stores/store-1/gallery/3/old-id";
  const { state, dependencies } = fakeDependencies({ gallery: { url: "https://old.test", storagePath: oldPath } });
  const result = await executeAdminStoreMedia({ operation: "delete", storeId: "store-1", kind: "gallery", slot: 3 }, admin, dependencies);
  assert.equal(result.success, true);
  assert.equal(state.clears, 1);
  assert.deepEqual(state.deleted, [oldPath]);
});

test("rejects content whose bytes do not match its extension and MIME", async () => {
  const { dependencies } = fakeDependencies();
  await expectMediaError(executeAdminStoreMedia(uploadInput({ imageBase64: Buffer.from("not an image").toString("base64") }), admin, dependencies), "invalid-argument");
});

test("rejects an image over the per-kind size limit", async () => {
  const bytes = Buffer.alloc(2 * 1024 * 1024 + 1);
  png.copy(bytes);
  const { dependencies } = fakeDependencies();
  await expectMediaError(executeAdminStoreMedia(uploadInput({ imageBase64: bytes.toString("base64") }), admin, dependencies), "invalid-argument");
});

test("rejects a gallery slot outside 0 through 9", async () => {
  const { dependencies } = fakeDependencies();
  await expectMediaError(executeAdminStoreMedia(uploadInput({ kind: "gallery", slot: 10 }), admin, dependencies), "invalid-argument");
});

test("rejects a non-admin before reading or changing store media", async () => {
  const { state, dependencies } = fakeDependencies();
  await assert.rejects(
    handleManageAdminStoreMedia(
      { data: uploadInput() },
      {
        authorize: async () => { throw new HttpsError("permission-denied", "denied"); },
        media: dependencies,
      },
    ),
    (error: unknown) => error instanceof HttpsError && error.code === "permission-denied",
  );
  assert.deepEqual(state.saved, []);
  assert.deepEqual(state.writes, []);
});

test("rejects client-supplied Storage paths", async () => {
  const { dependencies } = fakeDependencies();
  await assert.rejects(
    handleManageAdminStoreMedia(
      { data: { ...uploadInput(), storagePath: "stores/another-store/logo/file" } },
      { authorize: async () => admin, media: dependencies },
    ),
    (error: unknown) => error instanceof HttpsError && error.code === "invalid-argument",
  );
});

test("rejects an operation for a store that does not exist", async () => {
  const { dependencies } = fakeDependencies({ store: null });
  await expectMediaError(executeAdminStoreMedia(uploadInput(), admin, dependencies), "not-found");
});

test("rejects store IDs outside the explicit allowlist", async () => {
  const { dependencies } = fakeDependencies();
  await expectMediaError(executeAdminStoreMedia(uploadInput({ storeId: "store.1" }), admin, dependencies), "invalid-argument");
});

test("removes the newly saved object when the Firestore write fails", async () => {
  const { state, dependencies } = fakeDependencies();
  dependencies.writeMedia = async () => { throw new Error("firestore-failed"); };
  await assert.rejects(executeAdminStoreMedia(uploadInput(), admin, dependencies), /firestore-failed/);
  assert.deepEqual(state.deleted, ["stores/store-1/logo/generated-id"]);
});

test("restores Firestore metadata when Storage deletion fails", async () => {
  const oldPath = "stores/store-1/logo/old-id";
  const { state, dependencies } = fakeDependencies({
    store: { logoUrl: "https://old.test", logoStoragePath: oldPath },
  });
  dependencies.deleteImage = async () => { throw new Error("storage-failed"); };
  await expectMediaError(
    executeAdminStoreMedia({ operation: "delete", storeId: "store-1", kind: "logo" }, admin, dependencies),
    "failed-precondition",
  );
  assert.equal(state.clears, 1);
  assert.equal(state.restores, 1);
});

test("does not overwrite a newer image while recovering a failed deletion", async () => {
  const oldPath = "stores/store-1/logo/old-id";
  const { state, dependencies } = fakeDependencies({
    store: { logoUrl: "https://old.test", logoStoragePath: oldPath },
  });
  dependencies.deleteImage = async () => { throw new Error("storage-failed"); };
  dependencies.restoreMedia = async () => { state.restores += 1; return false; };
  await expectMediaError(
    executeAdminStoreMedia({ operation: "delete", storeId: "store-1", kind: "logo" }, admin, dependencies),
    "failed-precondition",
  );
  assert.equal(state.restores, 1);
});
