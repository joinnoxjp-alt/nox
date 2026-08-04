import assert from "node:assert/strict";
import {
  after,
  test
} from "node:test";

import {
  deleteApp,
  initializeApp
} from "firebase-admin/app";

import {
  getAuth
} from "firebase-admin/auth";

import {
  getFirestore
} from "firebase-admin/firestore";

import {
  FIXED_ADMIN_EMAIL,
  FIXED_ADMIN_UID
} from "../src/config";

const PROJECT_ID = "demo-nox-local";
const AUTH_EMULATOR_HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??
  "";
const FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST ??
  "";
const PASSWORD = "Test-password-123!";
const TARGET_UID = "adminRulesTargetUser";
const WRONG_UID = "adminRulesWrongUser";
const HISTORY_ID = "adminRulesStoreHistory";

if (
  process.env.GCLOUD_PROJECT !== PROJECT_ID ||
  !AUTH_EMULATOR_HOST ||
  !FIRESTORE_EMULATOR_HOST
) {
  throw new Error(
    "Rules tests require only the " +
    "demo-nox-local Auth and Firestore Emulators."
  );
}

const app = initializeApp(
  { projectId: PROJECT_ID },
  "firestore-admin-authorization-rules"
);
const auth = getAuth(app);
const firestore = getFirestore(app);

async function signIn(
  email: string
): Promise<string> {
  const response = await fetch(
    `http://${AUTH_EMULATOR_HOST}/` +
      "identitytoolkit.googleapis.com/v1/" +
      "accounts:signInWithPassword?key=fake-key",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password: PASSWORD,
        returnSecureToken: true
      })
    }
  );
  const payload =
    await response.json() as {
      idToken?: string;
    };

  assert.equal(response.ok, true);
  assert.ok(payload.idToken);
  return payload.idToken;
}

async function readTarget(
  idToken: string
): Promise<number> {
  const response = await fetch(
    `http://${FIRESTORE_EMULATOR_HOST}/v1/` +
      `projects/${PROJECT_ID}/databases/(default)/` +
      `documents/users/${TARGET_UID}`,
    {
      headers: {
        Authorization:
          `Bearer ${idToken}`
      }
    }
  );

  return response.status;
}

async function deleteStoreHistory(idToken?: string): Promise<number> {
  const response = await fetch(
    `http://${FIRESTORE_EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/storeApplications/${HISTORY_ID}`,
    {
      method: "DELETE",
      headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
    },
  );
  return response.status;
}

async function replaceFixedAdminAuth(
  options: {
    email: string;
    emailVerified: boolean;
  }
): Promise<string> {
  try {
    await auth.deleteUser(FIXED_ADMIN_UID);
  } catch {
    // The fixture may not exist yet.
  }

  await auth.createUser({
    uid: FIXED_ADMIN_UID,
    email: options.email,
    emailVerified:
      options.emailVerified,
    password: PASSWORD,
    disabled: false
  });

  return signIn(options.email);
}

after(async () => {
  await Promise.all([
    firestore
      .doc(`users/${FIXED_ADMIN_UID}`)
      .delete(),
    firestore
      .doc(`users/${WRONG_UID}`)
      .delete(),
    firestore
      .doc(`users/${TARGET_UID}`)
      .delete(),
    firestore.doc(`storeApplications/${HISTORY_ID}`).delete()
  ]);

  await Promise.all(
    [
      FIXED_ADMIN_UID,
      WRONG_UID
    ].map(async (uid) => {
      try {
        await auth.deleteUser(uid);
      } catch {
        // The fixture may already be absent.
      }
    })
  );

  await deleteApp(app);
});

test(
  "requires the fixed UID, email, verified email, admin role, and active status",
  async () => {
    await firestore
      .doc(`users/${TARGET_UID}`)
      .set({ role: "user", status: "active" });
    await firestore
      .doc(`users/${FIXED_ADMIN_UID}`)
      .set({
        role: "admin",
        status: "active"
      });

    const validToken =
      await replaceFixedAdminAuth({
        email: FIXED_ADMIN_EMAIL,
        emailVerified: true
      });

    assert.equal(
      await readTarget(validToken),
      200
    );

    await auth.createUser({
      uid: WRONG_UID,
      email: "wrong-admin@example.test",
      emailVerified: true,
      password: PASSWORD
    });
    await firestore
      .doc(`users/${WRONG_UID}`)
      .set({
        role: "admin",
        status: "active"
      });
    const wrongUidToken =
      await signIn(
        "wrong-admin@example.test"
      );

    assert.equal(
      await readTarget(wrongUidToken),
      403
    );

    const wrongEmailToken =
      await replaceFixedAdminAuth({
        email: "different@example.test",
        emailVerified: true
      });

    assert.equal(
      await readTarget(wrongEmailToken),
      403
    );

    const unverifiedToken =
      await replaceFixedAdminAuth({
        email: FIXED_ADMIN_EMAIL,
        emailVerified: false
      });

    assert.equal(
      await readTarget(unverifiedToken),
      403
    );

    const restoredToken =
      await replaceFixedAdminAuth({
        email: FIXED_ADMIN_EMAIL,
        emailVerified: true
      });

    await firestore
      .doc(`users/${FIXED_ADMIN_UID}`)
      .set({
        role: "user",
        status: "active"
      });
    assert.equal(
      await readTarget(restoredToken),
      403
    );

    await firestore
      .doc(`users/${FIXED_ADMIN_UID}`)
      .set({
        role: "admin",
        status: "blocked"
      });
    assert.equal(
      await readTarget(restoredToken),
      403
    );
  }
);

test("store application history cannot be deleted directly by any browser role", async () => {
  await firestore.doc(`storeApplications/${HISTORY_ID}`).set({ status: "approved" });
  await firestore.doc(`users/${FIXED_ADMIN_UID}`).set({ role: "admin", status: "active" });
  const adminToken = await replaceFixedAdminAuth({ email: FIXED_ADMIN_EMAIL, emailVerified: true });

  assert.equal(await deleteStoreHistory(), 401);
  assert.equal(await deleteStoreHistory(adminToken), 403);
  assert.equal((await firestore.doc(`storeApplications/${HISTORY_ID}`).get()).exists, true);
});
