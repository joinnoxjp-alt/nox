import assert from "node:assert/strict";
import test from "node:test";

import {
  loadPublicJobStoreMedia,
  PublicJobStoreMediaDependencies,
  PublicJobStoreMediaError,
} from "../src/domain/publicJobStoreMedia";

const publicJob = {
  status: "approved",
  isPublic: true,
  contractListingStatus: "active",
  storeId: "store-1",
  ownerId: "owner-1",
};
const imageUrl = (name: string) =>
  `https://firebasestorage.googleapis.com/v0/b/noxapp-29171.firebasestorage.app/o/${name}?alt=media&token=test`;

function dependencies(input: {
  job?: Record<string, unknown> | null;
  store?: Record<string, unknown> | null;
  gallery?: Array<{ slot: string; url: unknown }>;
} = {}): PublicJobStoreMediaDependencies {
  return {
    async getJob() { return input.job === undefined ? publicJob : input.job; },
    async getStore() { return input.store === undefined ? {} : input.store; },
    async getGallery() { return input.gallery ?? []; },
  };
}

async function expectError(promise: Promise<unknown>, code: PublicJobStoreMediaError["code"]) {
  await assert.rejects(
    promise,
    (error: unknown) => error instanceof PublicJobStoreMediaError && error.code === code,
  );
}

test("does not expose media for a non-public job", async () => {
  await expectError(loadPublicJobStoreMedia("job-1", dependencies({
    job: { ...publicJob, isPublic: false },
  })), "not-found");
});

test("does not expose media for a job that is not approved", async () => {
  await expectError(loadPublicJobStoreMedia("job-1", dependencies({
    job: { ...publicJob, status: "pending" },
  })), "not-found");
});

test("does not expose media for a contract-stopped job", async () => {
  await expectError(loadPublicJobStoreMedia("job-1", dependencies({
    job: { ...publicJob, contractListingStatus: "paused" },
  })), "not-found");
});

test("rejects an invalid job ID before reading data", async () => {
  let reads = 0;
  const deps = dependencies();
  deps.getJob = async () => { reads += 1; return publicJob; };
  await expectError(loadPublicJobStoreMedia("../job", deps), "invalid-argument");
  assert.equal(reads, 0);
});

test("returns empty media when the linked store does not exist", async () => {
  assert.deepEqual(
    await loadPublicJobStoreMedia("job-1", dependencies({ store: null })),
    { logoUrl: "", coverImageUrl: "", profileImageUrl: "", galleryImages: [] },
  );
});

test("returns empty media when the store has no images", async () => {
  assert.deepEqual(
    await loadPublicJobStoreMedia("job-1", dependencies()),
    { logoUrl: "", coverImageUrl: "", profileImageUrl: "", galleryImages: [] },
  );
});

test("sorts gallery URLs by slots zero through nine", async () => {
  const result = await loadPublicJobStoreMedia("job-1", dependencies({
    gallery: [
      { slot: "9", url: imageUrl("9.jpg") },
      { slot: "2", url: imageUrl("2.jpg") },
      { slot: "10", url: imageUrl("10.jpg") },
      { slot: "0", url: imageUrl("0.jpg") },
    ],
  }));
  assert.deepEqual(result.galleryImages, [
    imageUrl("0.jpg"),
    imageUrl("2.jpg"),
    imageUrl("9.jpg"),
  ]);
});

test("returns only the four public image fields and HTTPS URLs", async () => {
  const result = await loadPublicJobStoreMedia("job-1", dependencies({
    store: {
      logoUrl: imageUrl("logo.png"),
      coverImageUrl: "javascript:alert(1)",
      profileImageUrl: imageUrl("profile.png"),
      ownerId: "secret-owner",
      logoStoragePath: "stores/store-1/logo/private",
      adminNote: "private note",
    },
    gallery: [{ slot: "0", url: imageUrl("gallery.png") }],
  }));
  assert.deepEqual(Object.keys(result).sort(), [
    "coverImageUrl", "galleryImages", "logoUrl", "profileImageUrl",
  ]);
  assert.deepEqual(result, {
    logoUrl: imageUrl("logo.png"),
    coverImageUrl: "",
    profileImageUrl: imageUrl("profile.png"),
    galleryImages: [imageUrl("gallery.png")],
  });
});

test("rejects HTTPS image URLs hosted outside the project Storage bucket", async () => {
  const result = await loadPublicJobStoreMedia("job-1", dependencies({
    store: { logoUrl: "https://tracking.example/logo.png" },
    gallery: [{ slot: "0", url: "https://tracking.example/gallery.png" }],
  }));
  assert.equal(result.logoUrl, "");
  assert.deepEqual(result.galleryImages, []);
});
