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
  Timestamp,
  getFirestore
} from "firebase-admin/firestore";

import {
  FIXED_ADMIN_EMAIL,
  FIXED_ADMIN_UID
} from "../src/config";

const PROJECT_ID = "demo-nox-local";
const AUTH_HOST =
  "127.0.0.1:9099";
const STORE_UID =
  "contractFunctionStore";
const OTHER_ADMIN_UID =
  "contractFunctionOtherAdmin";
const PASSWORD =
  "Test-password-123!";
const FUNCTION_URL =
  "http://127.0.0.1:5001/" +
  `${PROJECT_ID}/asia-northeast1/` +
  "updateStoreContract";

if (
  process.env.GCLOUD_PROJECT !==
    PROJECT_ID ||
  process.env.FIRESTORE_EMULATOR_HOST !==
    "127.0.0.1:8080" ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !==
    AUTH_HOST ||
  process.env.FUNCTIONS_EMULATOR !==
    "true"
) {
  throw new Error(
    "Contract integration tests require " +
      "only demo-nox-local Emulators."
  );
}

const app = initializeApp(
  { projectId: PROJECT_ID },
  "update-store-contract-tests"
);
const auth = getAuth(app);
const firestore = getFirestore(app);

async function recreateUser(
  uid: string,
  email: string
): Promise<void> {
  try {
    await auth.deleteUser(uid);
  } catch {
    // The fixture may not exist.
  }
  await auth.createUser({
    uid,
    email,
    password: PASSWORD,
    emailVerified: true,
    disabled: false
  });
}

async function signIn(
  email: string
): Promise<string> {
  const response = await fetch(
    `http://${AUTH_HOST}/` +
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

async function callContract(
  idToken: string,
  overrides:
    Record<string, unknown> = {}
): Promise<{
  status: number;
  data?: {
    isPublic?: boolean;
    synchronizedJobCount?: number;
  };
}> {
  const now = Date.now();
  const response = await fetch(
    FUNCTION_URL,
    {
      method: "POST",
      headers: {
        Authorization:
          `Bearer ${idToken}`,
        "Content-Type":
          "application/json"
      },
      body: JSON.stringify({
        data: {
          storeUid: STORE_UID,
          planCode: "one_month",
          contractStartAt:
            new Date(
              now - 86_400_000
            ).toISOString(),
          contractEndAt:
            new Date(
              now + 86_400_000
            ).toISOString(),
          paymentStatus: "paid",
          listingStatus: "active",
          optionCodes: ["top_ad"],
          adminNote: "Emulator test",
          ...overrides
        }
      })
    }
  );
  const payload =
    await response.json() as {
      data?: {
        isPublic?: boolean;
        synchronizedJobCount?: number;
      };
      result?: {
        isPublic?: boolean;
        synchronizedJobCount?: number;
      };
    };
  return {
    status: response.status,
    data: payload.data ?? payload.result
  };
}

after(async () => {
  const collections = [
    "users",
    "stores",
    "storeContracts",
    "jobs",
    "adminAuditLogs",
    "pricingCatalog"
  ];
  for (const collectionName of collections) {
    const snapshot =
      await firestore
        .collection(collectionName)
        .get();
    await Promise.all(
      snapshot.docs.map((document) =>
        document.ref.delete()
      )
    );
  }
  for (const uid of [
    FIXED_ADMIN_UID,
    OTHER_ADMIN_UID,
    STORE_UID
  ]) {
    try {
      await auth.deleteUser(uid);
    } catch {
      // The fixture may already be absent.
    }
  }
  await deleteApp(app);
});

test(
  "contract updates synchronize publication caches safely",
  async (t) => {
    await recreateUser(
      FIXED_ADMIN_UID,
      FIXED_ADMIN_EMAIL
    );
    await recreateUser(
      OTHER_ADMIN_UID,
      "other-admin@example.test"
    );
    await recreateUser(
      STORE_UID,
      "store@example.test"
    );
    await firestore
      .doc(`users/${FIXED_ADMIN_UID}`)
      .set({
        role: "admin",
        status: "active"
      });
    await firestore
      .doc(`users/${OTHER_ADMIN_UID}`)
      .set({
        role: "admin",
        status: "active"
      });
    await firestore
      .doc(`users/${STORE_UID}`)
      .set({
        role: "store",
        status: "active"
      });
    await firestore
      .doc(`stores/${STORE_UID}`)
      .set({
        ownerId: STORE_UID,
        storeName: "Contract Test"
      });
    await firestore
      .doc("pricingCatalog/current")
      .set({
        schemaVersion: 1,
        status: "active",
        effectiveFrom:
          Timestamp.now(),
        listingPlans: {
          oneMonth: {
            planCode: "one_month",
            label: "1ヶ月",
            durationMonths: 1,
            amount: 4980
          },
          sixMonths: {
            planCode: "six_months",
            label: "6ヶ月",
            durationMonths: 6,
            amount: 29800
          },
          twelveMonths: {
            planCode:
              "twelve_months",
            label: "12ヶ月",
            durationMonths: 12,
            amount: 59760
          }
        },
        options: {
          topAd: {
            optionCode: "top_ad",
            label: "TOP広告",
            billingUnit: "month",
            amount: 15000
          },
          newJob: {
            optionCode: "new_job",
            label: "新着求人掲載",
            billingUnit: "month",
            amount: 1000
          }
        }
      });
    await firestore.doc("jobs/approvedJob").set({
      ownerId: STORE_UID,
      storeId: STORE_UID,
      status: "approved",
      isPublic: false,
      contractListingStatus: "pending"
    });
    await firestore.doc("jobs/draftJob").set({
      ownerId: STORE_UID,
      storeId: STORE_UID,
      status: "draft",
      isPublic: false,
      contractListingStatus: "pending"
    });

    const adminToken =
      await signIn(FIXED_ADMIN_EMAIL);
    const otherAdminToken =
      await signIn(
        "other-admin@example.test"
      );

    await t.test(
      "fixed administrator is required",
      async () => {
        const response =
          await callContract(
            otherAdminToken
          );
        assert.equal(response.status, 403);
        assert.equal(
          (
            await firestore
              .doc(
                `storeContracts/${STORE_UID}`
              )
              .get()
          ).exists,
          false
        );
      }
    );

    await t.test(
      "paid active contract publishes only approved jobs",
      async () => {
        const response =
          await callContract(adminToken);
        assert.equal(response.status, 200);
        assert.equal(
          response.data?.isPublic,
          true
        );
        assert.equal(
          response.data
            ?.synchronizedJobCount,
          2
        );

        const [
          contract,
          store,
          approvedJob,
          draftJob,
          audit
        ] = await Promise.all([
          firestore
            .doc(
              `storeContracts/${STORE_UID}`
            )
            .get(),
          firestore
            .doc(`stores/${STORE_UID}`)
            .get(),
          firestore
            .doc("jobs/approvedJob")
            .get(),
          firestore
            .doc("jobs/draftJob")
            .get(),
          firestore
            .collection("adminAuditLogs")
            .get()
        ]);

        assert.equal(
          contract.data()?.listingAmount,
          4980
        );
        assert.equal(
          contract.data()?.optionAmount,
          15000
        );
        assert.equal(
          contract.data()?.totalAmount,
          19980
        );
        assert.equal(
          store.data()?.isPublic,
          true
        );
        assert.equal(
          approvedJob.data()?.isPublic,
          true
        );
        assert.equal(
          draftJob.data()?.isPublic,
          false
        );
        assert.equal(audit.size, 1);
      }
    );

    await t.test(
      "unpaid and stopped states always disable caches",
      async () => {
        for (const state of [
          {
            paymentStatus:
              "awaiting_payment",
            listingStatus: "active"
          },
          {
            paymentStatus: "paid",
            listingStatus: "paused"
          },
          {
            paymentStatus: "expired",
            listingStatus: "expired"
          },
          {
            paymentStatus: "suspended",
            listingStatus: "suspended"
          }
        ]) {
          const response =
            await callContract(
              adminToken,
              state
            );
          assert.equal(
            response.status,
            200
          );
          assert.equal(
            response.data?.isPublic,
            false
          );
          assert.equal(
            (
              await firestore
                .doc(
                  `stores/${STORE_UID}`
                )
                .get()
            ).data()?.isPublic,
            false
          );
        }
      }
    );

    await t.test(
      "pricing snapshot does not change when catalog changes",
      async () => {
        const before =
          await firestore
            .doc(
              `storeContracts/${STORE_UID}`
            )
            .get();
        await firestore
          .doc("pricingCatalog/current")
          .update({
            "listingPlans.oneMonth.amount":
              9999
          });
        const after =
          await firestore
            .doc(
              `storeContracts/${STORE_UID}`
            )
            .get();
        assert.equal(
          after.data()?.listingAmount,
          before.data()?.listingAmount
        );
      }
    );
  }
);
