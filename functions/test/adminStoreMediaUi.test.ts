import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

interface MediaUiModule {
  ADMIN_VISIBLE_MEDIA_KINDS: readonly string[];
  validateFile(file: { name: string; type: string; size: number }, kind: string): void;
  buildUploadRequest(input: Record<string, unknown>): Record<string, unknown>;
  buildDeleteRequest(input: Record<string, unknown>): Record<string, unknown>;
}

const mediaUi = require(
  path.resolve(__dirname, "../../../pages/admin-store-media.js"),
) as MediaUiModule;

const pngFile = { name: "store.png", type: "image/png", size: 1024 };

test("builds an upload request without accepting a Storage path", () => {
  assert.deepEqual(
    mediaUi.buildUploadRequest({
      storeId: "store-1", kind: "logo", file: pngFile,
      imageBase64: "base64-data", storagePath: "client/path",
    }),
    {
      operation: "upload", storeId: "store-1", kind: "logo",
      fileName: "store.png", contentType: "image/png", imageBase64: "base64-data",
    },
  );
});

test("includes only a validated gallery slot in upload requests", () => {
  const request = mediaUi.buildUploadRequest({
    storeId: "store-1", kind: "gallery", slot: 9,
    file: pngFile, imageBase64: "base64-data",
  });
  assert.equal(request.slot, 9);
  assert.throws(() => mediaUi.buildUploadRequest({
    storeId: "store-1", kind: "gallery", slot: 10,
    file: pngFile, imageBase64: "base64-data",
  }));
});

test("applies the two and five megabyte client limits", () => {
  assert.throws(() => mediaUi.validateFile(
    { ...pngFile, size: 2 * 1024 * 1024 + 1 }, "logo",
  ));
  assert.doesNotThrow(() => mediaUi.validateFile(
    { ...pngFile, size: 5 * 1024 * 1024 }, "cover",
  ));
});

test("rejects unsupported MIME types", () => {
  assert.throws(() => mediaUi.validateFile(
    { name: "store.gif", type: "image/gif", size: 100 }, "profile",
  ));
});

test("builds deletion requests without client-controlled paths", () => {
  assert.deepEqual(
    mediaUi.buildDeleteRequest({ storeId: "store-1", kind: "gallery", slot: 0 }),
    { operation: "delete", storeId: "store-1", kind: "gallery", slot: 0 },
  );
});

test("admin UI exposes profile, representative cover and gallery controls", () => {
  assert.deepEqual(mediaUi.ADMIN_VISIBLE_MEDIA_KINDS, ["profile", "cover", "gallery"]);
  const adminSource = readFileSync(
    path.resolve(__dirname, "../../../pages/admin.html"), "utf8",
  );
  assert.match(adminSource, /createStoreMediaItem\(store, "cover"/);
  assert.match(adminSource, /createStoreMediaItem\(store, "gallery"/);
  assert.doesNotMatch(adminSource, /createStoreMediaItem\(store, "logo"/);
  assert.match(adminSource, /createStoreMediaItem\(store, "profile"/);
  for (const id of ["directStoreProfileImage", "directStoreCoverImage", "directStoreGalleryImages"]) {
    assert.match(adminSource, new RegExp(`id="${id}"`));
  }
  assert.match(adminSource, /kind: "profile"/);
  assert.match(adminSource, /kind: "cover"/);
  assert.match(adminSource, /kind: "gallery"/);
  assert.match(adminSource, /manageAdminStoreMediaCallable/);
});
