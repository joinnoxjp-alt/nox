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
const AUTH_HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "";
const FIRESTORE_HOST =
  process.env.FIRESTORE_EMULATOR_HOST ?? "";
const PASSWORD = "Test-password-123!";
const STORE_UID = "pricingContractStore";
const OTHER_STORE_UID = "pricingContractOtherStore";
const USER_UID = "pricingContractGeneralUser";

if (
  process.env.GCLOUD_PROJECT !== PROJECT_ID ||
  !AUTH_HOST ||
  !FIRESTORE_HOST
) {
  throw new Error(
    "Pricing and contract Rules tests require only the " +
      "demo-nox-local Auth and Firestore Emulators."
  );
}

const app = initializeApp(
  { projectId: PROJECT_ID },
  "firestore-pricing-contract-rules"
);
const auth = getAuth(app);
const firestore = getFirestore(app);

function documentUrl(path: string): string {
  return `http://${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}` +
    `/databases/(default)/documents/${path}`;
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
  const payload = await response.json() as {
    idToken?: string;
  };
  assert.equal(response.ok, true);
  assert.ok(payload.idToken);
  return payload.idToken;
}

async function requestDocument(
  path: string,
  method: "GET" | "PATCH" | "DELETE",
  idToken?: string
): Promise<number> {
  const response = await fetch(documentUrl(path), {
    method,
    headers: {
      ...(idToken
        ? { Authorization: `Bearer ${idToken}` }
        : {}),
      ...(method === "PATCH"
        ? { "Content-Type": "application/json" }
        : {})
    },
    body: method === "PATCH"
      ? JSON.stringify({
          fields: {
            status: { stringValue: "active" }
          }
        })
      : undefined
  });
  return response.status;
}

async function patchFields(
  path: string,
  fields: Record<string, unknown>,
  fieldPaths: string[],
  idToken: string
): Promise<number> {
  const query = fieldPaths
    .map((fieldPath) =>
      `updateMask.fieldPaths=${encodeURIComponent(fieldPath)}`
    )
    .join("&");
  const response = await fetch(
    `${documentUrl(path)}?${query}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ fields })
    }
  );
  return response.status;
}

after(async () => {
  await Promise.all([
    firestore.doc("pricingCatalog/current").delete(),
    firestore.doc("pricingCatalog/inactive").delete(),
    firestore.doc(`storeContracts/${STORE_UID}`).delete(),
    firestore.doc(`storeContracts/${OTHER_STORE_UID}`).delete(),
    firestore.doc(`stores/${STORE_UID}`).delete(),
    firestore.doc(`stores/${OTHER_STORE_UID}`).delete(),
    firestore.doc(`users/${STORE_UID}`).delete(),
    firestore.doc(`users/${OTHER_STORE_UID}`).delete(),
    firestore.doc(`users/${USER_UID}`).delete(),
    firestore.doc(`users/${FIXED_ADMIN_UID}`).delete(),
    firestore.doc("adminAuditLogs/rules-test").delete()
  ]);

  await Promise.all(
    [
      STORE_UID,
      OTHER_STORE_UID,
      USER_UID,
      FIXED_ADMIN_UID
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

test("pricing catalog and store contract access boundaries", async (t) => {
  const identities = [
    {
      uid: STORE_UID,
      email: "contract-store@example.test",
      role: "store",
      status: "active"
    },
    {
      uid: OTHER_STORE_UID,
      email: "other-contract-store@example.test",
      role: "store",
      status: "active"
    },
    {
      uid: USER_UID,
      email: "contract-user@example.test",
      role: "user",
      status: "active"
    },
    {
      uid: FIXED_ADMIN_UID,
      email: FIXED_ADMIN_EMAIL,
      role: "admin",
      status: "active"
    }
  ] as const;

  for (const identity of identities) {
    try {
      await auth.deleteUser(identity.uid);
    } catch {
      // The fixture may not exist yet.
    }
    await auth.createUser({
      uid: identity.uid,
      email: identity.email,
      emailVerified: true,
      password: PASSWORD
    });
    await firestore.doc(`users/${identity.uid}`).set({
      role: identity.role,
      status: identity.status
    });
  }

  await firestore.doc(`stores/${STORE_UID}`).set({
    ownerId: STORE_UID,
    storeName: "Contract Test Store"
  });
  await firestore.doc(`stores/${OTHER_STORE_UID}`).set({
    ownerId: OTHER_STORE_UID,
    storeName: "Other Contract Test Store"
  });
  await firestore.doc("pricingCatalog/current").set({
    schemaVersion: 1,
    status: "active",
    currency: "JPY"
  });
  await firestore.doc("pricingCatalog/inactive").set({
    schemaVersion: 1,
    status: "inactive",
    currency: "JPY"
  });
  await firestore.doc(`storeContracts/${STORE_UID}`).set({
    schemaVersion: 1,
    storeId: STORE_UID,
    ownerId: STORE_UID,
    paymentStatus: "paid",
    listingStatus: "active"
  });
  await firestore.doc(`storeContracts/${OTHER_STORE_UID}`).set({
    schemaVersion: 1,
    storeId: OTHER_STORE_UID,
    ownerId: OTHER_STORE_UID,
    paymentStatus: "paid",
    listingStatus: "active"
  });

  const storeToken = await signIn(
    "contract-store@example.test"
  );
  const otherStoreToken = await signIn(
    "other-contract-store@example.test"
  );
  const userToken = await signIn(
    "contract-user@example.test"
  );
  const adminToken = await signIn(FIXED_ADMIN_EMAIL);

  await t.test("active pricing is public", async () => {
    assert.equal(
      await requestDocument("pricingCatalog/current", "GET"),
      200
    );
  });

  await t.test("inactive pricing is not public", async () => {
    assert.equal(
      await requestDocument("pricingCatalog/inactive", "GET"),
      403
    );
  });

  await t.test("all clients cannot write pricing", async () => {
    for (const token of [
      storeToken,
      userToken,
      adminToken
    ]) {
      assert.equal(
        await requestDocument(
          "pricingCatalog/current",
          "PATCH",
          token
        ),
        403
      );
      assert.equal(
        await requestDocument(
          "pricingCatalog/current",
          "DELETE",
          token
        ),
        403
      );
    }
  });

  await t.test("store reads only its own contract", async () => {
    assert.equal(
      await requestDocument(
        `storeContracts/${STORE_UID}`,
        "GET",
        storeToken
      ),
      200
    );
    assert.equal(
      await requestDocument(
        `storeContracts/${OTHER_STORE_UID}`,
        "GET",
        storeToken
      ),
      403
    );
    assert.equal(
      await requestDocument(
        `storeContracts/${STORE_UID}`,
        "GET",
        otherStoreToken
      ),
      403
    );
  });

  await t.test("general and anonymous users cannot read contracts", async () => {
    assert.equal(
      await requestDocument(
        `storeContracts/${STORE_UID}`,
        "GET",
        userToken
      ),
      403
    );
    assert.equal(
      await requestDocument(
        `storeContracts/${STORE_UID}`,
        "GET"
      ),
      403
    );
  });

  await t.test("fixed active admin may read contracts", async () => {
    assert.equal(
      await requestDocument(
        `storeContracts/${STORE_UID}`,
        "GET",
        adminToken
      ),
      200
    );
  });

  await t.test("all clients cannot write contracts", async () => {
    for (const token of [
      storeToken,
      otherStoreToken,
      userToken,
      adminToken
    ]) {
      assert.equal(
        await requestDocument(
          `storeContracts/${STORE_UID}`,
          "PATCH",
          token
        ),
        403
      );
      assert.equal(
        await requestDocument(
          `storeContracts/${STORE_UID}`,
          "DELETE",
          token
        ),
        403
      );
    }
  });

  await t.test("store cannot modify publication caches", async () => {
    assert.equal(
      await patchFields(
        `stores/${STORE_UID}`,
        {
          isPublic: {
            booleanValue: true
          },
          contractListingStatus: {
            stringValue: "active"
          },
          contractEndAt: {
            timestampValue:
              "2099-12-31T23:59:59Z"
          }
        },
        [
          "isPublic",
          "contractListingStatus",
          "contractEndAt"
        ],
        storeToken
      ),
      403
    );
  });

  await t.test("audit logs are admin-read-only for clients", async () => {
    await firestore.doc("adminAuditLogs/rules-test").set({
      action: "test",
      createdAt: new Date()
    });
    assert.equal(
      await requestDocument(
        "adminAuditLogs/rules-test",
        "GET",
        adminToken
      ),
      200
    );
    assert.equal(
      await requestDocument(
        "adminAuditLogs/rules-test",
        "GET",
        storeToken
      ),
      403
    );
    assert.equal(
      await requestDocument(
        "adminAuditLogs/rules-test",
        "PATCH",
        adminToken
      ),
      403
    );
  });
});
