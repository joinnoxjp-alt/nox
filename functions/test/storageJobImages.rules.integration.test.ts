import assert from "node:assert/strict";
import { after, test } from "node:test";

import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = "demo-nox-local";
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "";
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "";
const STORAGE_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? "";
const BUCKET = `${PROJECT_ID}.appspot.com`;
const PASSWORD = "Test-password-123!";
const STORE_UID = "storageJobStore";
const OTHER_STORE_UID = "storageOtherStore";
const PENDING_STORE_UID = "storagePendingStore";
const BLOCKED_STORE_UID = "storageBlockedStore";
const MISMATCH_STORE_UID = "storageMismatchStore";
const USER_UID = "storageGeneralUser";
const JOB_ID = "storage-owned-job";

if (
  process.env.GCLOUD_PROJECT !== PROJECT_ID ||
  !AUTH_HOST ||
  !FIRESTORE_HOST ||
  !STORAGE_HOST
) {
  throw new Error(
    "Storage Rules tests require only demo-nox-local Auth, Firestore, " +
      "and Storage Emulator environment guards."
  );
}

const app = initializeApp(
  { projectId: PROJECT_ID },
  "storage-job-image-rules"
);
const auth = getAuth(app);
const firestore = getFirestore(app);

async function createIdentity(
  uid: string,
  email: string,
  role: string,
  status: string
): Promise<void> {
  try {
    await auth.deleteUser(uid);
  } catch {
    // Fixture may not exist.
  }
  await auth.createUser({
    uid,
    email,
    emailVerified: true,
    password: PASSWORD
  });
  await firestore.doc(`users/${uid}`).set({ role, status });
}

async function signIn(email: string): Promise<string> {
  const response = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/` +
      "accounts:signInWithPassword?key=fake-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password: PASSWORD,
        returnSecureToken: true
      })
    }
  );
  const payload = await response.json() as { idToken?: string };
  assert.equal(response.ok, true);
  assert.ok(payload.idToken);
  return payload.idToken;
}

function objectUrl(path: string, media = false): string {
  return `http://${STORAGE_HOST}/v0/b/${BUCKET}/o/` +
    `${encodeURIComponent(path)}${media ? "?alt=media" : ""}`;
}

async function upload(
  path: string,
  contentType: string | undefined,
  token: string | undefined,
  size = 32
): Promise<number> {
  const boundary = "nox-storage-rules-boundary";
  const metadata = JSON.stringify({
    name: path,
    ...(contentType ? { contentType } : {})
  });
  const prefix = Buffer.from(
    `--${boundary}\r\n` +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${contentType ?? "application/octet-stream"}\r\n\r\n`
  );
  const suffix = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([
    prefix,
    Buffer.alloc(size, 1),
    suffix
  ]);
  const response = await fetch(
    `http://${STORAGE_HOST}/v0/b/${BUCKET}/o/` +
      `${encodeURIComponent(path)}` +
      "?uploadType=multipart",
    {
      method: "POST",
      headers: {
        ...(token
          ? { Authorization: `Bearer ${token}` }
          : {}),
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "x-goog-upload-protocol": "multipart"
      },
      body
    }
  );
  return response.status;
}

async function remove(
  path: string,
  token?: string
): Promise<number> {
  const response = await fetch(objectUrl(path), {
    method: "DELETE",
    headers: token
      ? { Authorization: `Bearer ${token}` }
      : undefined
  });
  return response.status;
}

async function read(path: string, token?: string): Promise<number> {
  const response = await fetch(objectUrl(path, true), {
    headers: token
      ? { Authorization: `Bearer ${token}` }
      : undefined
  });
  return response.status;
}

after(async () => {
  for (const collection of ["jobs", "stores", "users"]) {
    const snapshot = await firestore.collection(collection).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
  await Promise.all(
    [
      STORE_UID,
      OTHER_STORE_UID,
      PENDING_STORE_UID,
      BLOCKED_STORE_UID,
      MISMATCH_STORE_UID,
      USER_UID
    ].map(async (uid) => {
      try {
        await auth.deleteUser(uid);
      } catch {
        // Fixture may not exist.
      }
    })
  );
  await deleteApp(app);
});

test("canonical job image storage rules", async (t) => {
  const identities = [
    [STORE_UID, "storage-store@example.test", "store", "active"],
    [OTHER_STORE_UID, "storage-other@example.test", "store", "active"],
    [PENDING_STORE_UID, "storage-pending@example.test", "store", "pending"],
    [BLOCKED_STORE_UID, "storage-blocked@example.test", "store", "blocked"],
    [MISMATCH_STORE_UID, "storage-mismatch@example.test", "store", "active"],
    [USER_UID, "storage-user@example.test", "user", "active"]
  ] as const;
  for (const [uid, email, role, status] of identities) {
    await createIdentity(uid, email, role, status);
  }

  await firestore.doc(`stores/${STORE_UID}`).set({
    ownerId: STORE_UID,
    storeName: "Storage Store"
  });
  await firestore.doc(`stores/${OTHER_STORE_UID}`).set({
    ownerId: OTHER_STORE_UID,
    storeName: "Other Storage Store"
  });
  await firestore.doc(`stores/${PENDING_STORE_UID}`).set({
    ownerId: PENDING_STORE_UID
  });
  await firestore.doc(`stores/${BLOCKED_STORE_UID}`).set({
    ownerId: BLOCKED_STORE_UID
  });
  await firestore.doc(`stores/${MISMATCH_STORE_UID}`).set({
    ownerId: OTHER_STORE_UID
  });
  await firestore.doc(`jobs/${JOB_ID}`).set({
    ownerId: STORE_UID,
    storeId: STORE_UID,
    status: "draft"
  });
  await firestore.doc("jobs/other-job").set({
    ownerId: OTHER_STORE_UID,
    storeId: OTHER_STORE_UID,
    status: "draft"
  });

  const tokens = new Map<string, string>();
  for (const [uid, email] of identities) {
    tokens.set(uid, await signIn(email));
  }
  const ownerToken = tokens.get(STORE_UID)!;

  for (const [extension, contentType] of [
    ["jpg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"]
  ] as const) {
    await t.test(`${contentType} upload succeeds`, async () => {
      assert.equal(
        await upload(
          `jobs/${STORE_UID}/${JOB_ID}/valid.${extension}`,
          contentType,
          ownerToken
        ),
        200
      );
    });
  }

  await t.test("another store is denied", async () => {
    assert.equal(
      await upload(
        `jobs/${STORE_UID}/${JOB_ID}/other.jpg`,
        "image/jpeg",
        tokens.get(OTHER_STORE_UID)
      ),
      403
    );
  });

  await t.test("general user is denied", async () => {
    assert.equal(
      await upload(
        `jobs/${USER_UID}/${JOB_ID}/user.jpg`,
        "image/jpeg",
        tokens.get(USER_UID)
      ),
      403
    );
  });

  for (const uid of [PENDING_STORE_UID, BLOCKED_STORE_UID]) {
    await t.test(`${uid} is denied`, async () => {
      assert.equal(
        await upload(
          `jobs/${uid}/${JOB_ID}/status.jpg`,
          "image/jpeg",
          tokens.get(uid)
        ),
        403
      );
    });
  }

  await t.test("store ownerId mismatch is denied", async () => {
    assert.equal(
      await upload(
        `jobs/${MISMATCH_STORE_UID}/${JOB_ID}/mismatch.jpg`,
        "image/jpeg",
        tokens.get(MISMATCH_STORE_UID)
      ),
      403
    );
  });

  await t.test("job ownership mismatch is denied", async () => {
    assert.equal(
      await upload(
        `jobs/${STORE_UID}/other-job/wrong-job.jpg`,
        "image/jpeg",
        ownerToken
      ),
      403
    );
  });

  for (const [extension, contentType] of [
    ["svg", "image/svg+xml"],
    ["gif", "image/gif"],
    ["mp4", "video/mp4"],
    ["bin", undefined]
  ] as const) {
    await t.test(`${extension} content is denied`, async () => {
      assert.equal(
        await upload(
          `jobs/${STORE_UID}/${JOB_ID}/invalid.${extension}`,
          contentType,
          ownerToken
        ),
        403
      );
    });
  }

  await t.test("oversized image is denied", async () => {
    assert.equal(
      await upload(
        `jobs/${STORE_UID}/${JOB_ID}/large.jpg`,
        "image/jpeg",
        ownerToken,
        5 * 1024 * 1024 + 1
      ),
      403
    );
  });

  await t.test("undefined path is denied", async () => {
    assert.equal(
      await upload(
        `unknown/${STORE_UID}/file.jpg`,
        "image/jpeg",
        ownerToken
      ),
      403
    );
  });

  await t.test("legacy two-level path is read-only", async () => {
    assert.equal(
      await upload(
        `jobs/${STORE_UID}/legacy.jpg`,
        "image/jpeg",
        ownerToken
      ),
      403
    );
  });

  await t.test("job image is publicly readable", async () => {
    assert.equal(
      await read(`jobs/${STORE_UID}/${JOB_ID}/valid.jpg`),
      200
    );
  });

  await t.test("owner can delete its job image", async () => {
    assert.equal(
      await remove(
        `jobs/${STORE_UID}/${JOB_ID}/valid.png`,
        ownerToken
      ),
      204
    );
  });

  await t.test("another store cannot delete job image", async () => {
    assert.equal(
      await remove(
        `jobs/${STORE_UID}/${JOB_ID}/valid.webp`,
        tokens.get(OTHER_STORE_UID)
      ),
      403
    );
  });
});

test("existing store image rules regression (22 cases)", async (t) => {
  const ownerToken = await signIn("storage-store@example.test");
  const otherToken = await signIn("storage-other@example.test");
  const userToken = await signIn("storage-user@example.test");
  const validPaths = [
    `stores/${STORE_UID}/logo/logo-file`,
    `stores/${STORE_UID}/cover/cover-file`,
    `stores/${STORE_UID}/profile/profile-file`,
    `stores/${STORE_UID}/gallery/0/gallery-file`
  ];

  for (const path of validPaths) {
    await t.test(`owner uploads ${path}`, async () => {
      assert.equal(
        await upload(path, "image/jpeg", ownerToken),
        200
      );
    });
  }
  for (const path of validPaths) {
    await t.test(`other store cannot upload ${path}`, async () => {
      assert.equal(
        await upload(`${path}-other`, "image/jpeg", otherToken),
        403
      );
    });
  }
  for (const path of validPaths) {
    await t.test(`general user cannot upload ${path}`, async () => {
      assert.equal(
        await upload(`${path}-user`, "image/jpeg", userToken),
        403
      );
    });
  }
  for (const [index, contentType] of [
    [1, "image/svg+xml"],
    [2, "image/gif"],
    [3, "video/mp4"]
  ] as const) {
    await t.test(`store image rejects ${contentType}`, async () => {
      assert.equal(
        await upload(
          `stores/${STORE_UID}/gallery/${index}/invalid-${index}`,
          contentType,
          ownerToken
        ),
        403
      );
    });
  }
  await t.test("gallery slot 10 is denied", async () => {
    assert.equal(
      await upload(
        `stores/${STORE_UID}/gallery/10/file`,
        "image/jpeg",
        ownerToken
      ),
      403
    );
  });
  await t.test("store image is publicly readable", async () => {
    assert.equal(await read(validPaths[0]), 200);
  });
  for (const path of validPaths.slice(0, 3)) {
    await t.test(`owner deletes ${path}`, async () => {
      assert.equal(await remove(path, ownerToken), 204);
    });
  }
  await t.test("other store cannot delete gallery image", async () => {
    assert.equal(await remove(validPaths[3], otherToken), 403);
  });
  await t.test("owner deletes gallery image", async () => {
    assert.equal(await remove(validPaths[3], ownerToken), 204);
  });
});
