import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createHash } from "node:crypto";
import {
  deleteApp,
  initializeApp
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  Timestamp,
  getFirestore
} from "firebase-admin/firestore";
import {
  FIXED_ADMIN_EMAIL,
  FIXED_ADMIN_UID
} from "../src/config";

const PROJECT_ID = "demo-nox-local";
const AUTH_HOST = "127.0.0.1:9099";
const FUNCTION_URL =
  "http://127.0.0.1:5001/" +
  `${PROJECT_ID}/asia-northeast1/approveJobApplication`;
const PASSWORD = "Test-password-123!";
const STORE_UID = "approveJobStoreUser";
const OTHER_UID = "approveJobOtherUser";

if (
  process.env.GCLOUD_PROJECT !== PROJECT_ID ||
  process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== AUTH_HOST ||
  process.env.FUNCTIONS_EMULATOR !== "true"
) {
  throw new Error(
    "Job approval tests require only demo-nox-local Emulators."
  );
}

const app = initializeApp(
  { projectId: PROJECT_ID },
  "approve-job-application-tests"
);
const auth = getAuth(app);
const firestore = getFirestore(app);
let sequence = 0;

interface CallableResult {
  status: number;
  data?: {
    approved?: boolean;
    idempotent?: boolean;
  };
  errorStatus?: string;
}

interface SeedOverrides {
  application?: Record<string, unknown>;
  job?: Record<string, unknown>;
  store?: Record<string, unknown> | null;
  contract?: Record<string, unknown> | null;
}

async function recreateUser(
  uid: string,
  email: string,
  options: {
    emailVerified?: boolean;
  } = {}
): Promise<void> {
  try {
    await auth.deleteUser(uid);
  } catch {
    // Fixture may not exist.
  }
  await auth.createUser({
    uid,
    email,
    password: PASSWORD,
    emailVerified: options.emailVerified ?? true,
    disabled: false
  });
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

async function adminToken(
  options: {
    email?: string;
    emailVerified?: boolean;
    disabledAfterSignIn?: boolean;
    role?: string;
    status?: string;
  } = {}
): Promise<string> {
  const email = options.email ?? FIXED_ADMIN_EMAIL;
  await recreateUser(FIXED_ADMIN_UID, email, {
    emailVerified: options.emailVerified ?? true
  });
  await firestore.doc(`users/${FIXED_ADMIN_UID}`).set({
    role: options.role ?? "admin",
    status: options.status ?? "active"
  });
  const token = await signIn(email);
  if (options.disabledAfterSignIn) {
    await auth.updateUser(FIXED_ADMIN_UID, {
      disabled: true
    });
  }
  return token;
}

async function callApproval(
  token: string | null,
  applicationId: unknown
): Promise<CallableResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      data: { applicationId }
    })
  });
  const payload = await response.json() as {
    data?: CallableResult["data"];
    result?: CallableResult["data"];
    error?: { status?: string };
  };
  return {
    status: response.status,
    data: payload.data ?? payload.result,
    errorStatus: payload.error?.status
  };
}

function nextId(): string {
  sequence += 1;
  return `A${String(sequence).padStart(19, "0")}`;
}

async function seed(
  overrides: SeedOverrides = {}
): Promise<string> {
  const id = nextId();
  const now = Timestamp.now();
  await firestore.doc(`jobApplications/${id}`).set({
    jobId: id,
    ownerId: STORE_UID,
    submittedBy: STORE_UID,
    storeId: STORE_UID,
    status: "pending",
    createdAt: now,
    ...overrides.application
  });
  await firestore.doc(`jobs/${id}`).set({
    schemaVersion: 1,
    ownerId: STORE_UID,
    storeId: STORE_UID,
    sourceApplicationId: id,
    status: "pending",
    isPublic: false,
    contractListingStatus: "active",
    ...overrides.job
  });
  if (overrides.store !== null) {
    await firestore.doc(`stores/${STORE_UID}`).set({
      ownerId: STORE_UID,
      isPublic: true,
      contractListingStatus: "active",
      ...overrides.store
    });
  } else {
    await firestore.doc(`stores/${STORE_UID}`).delete();
  }
  if (overrides.contract !== null) {
    await firestore.doc(`storeContracts/${STORE_UID}`).set({
      ownerId: STORE_UID,
      storeId: STORE_UID,
      paymentStatus: "paid",
      listingStatus: "active",
      contractStartAt: Timestamp.fromMillis(
        now.toMillis() - 86_400_000
      ),
      contractEndAt: Timestamp.fromMillis(
        now.toMillis() + 86_400_000
      ),
      ...overrides.contract
    });
  } else {
    await firestore.doc(`storeContracts/${STORE_UID}`).delete();
  }
  return id;
}

async function assertUnchanged(id: string): Promise<void> {
  const [application, job] = await Promise.all([
    firestore.doc(`jobApplications/${id}`).get(),
    firestore.doc(`jobs/${id}`).get()
  ]);
  assert.equal(application.data()?.status, "pending");
  assert.equal(job.data()?.status, "pending");
  assert.notEqual(job.data()?.isPublic, true);
}

after(async () => {
  for (const name of [
    "users",
    "stores",
    "storeContracts",
    "jobs",
    "jobApplications",
    "adminAuditLogs",
    "storeInvites"
  ]) {
    const snapshot = await firestore.collection(name).get();
    await Promise.all(
      snapshot.docs.map((document) => document.ref.delete())
    );
  }
  for (const uid of [FIXED_ADMIN_UID, OTHER_UID]) {
    try {
      await auth.deleteUser(uid);
    } catch {
      // Fixture may not exist.
    }
  }
  await deleteApp(app);
});

test("approveJobApplication security and atomicity", async (t) => {
  await t.test("unauthenticated is rejected", async () => {
    const result = await callApproval(null, nextId());
    assert.equal(result.errorStatus, "UNAUTHENTICATED");
  });

  const validToken = await adminToken();
  await t.test("invalid input is rejected", async () => {
    const result = await callApproval(validToken, "../bad");
    assert.equal(result.errorStatus, "INVALID_ARGUMENT");
  });

  await t.test("another UID is rejected", async () => {
    await recreateUser(OTHER_UID, "other@example.test");
    await firestore.doc(`users/${OTHER_UID}`).set({
      role: "admin",
      status: "active"
    });
    const result = await callApproval(
      await signIn("other@example.test"),
      nextId()
    );
    assert.equal(result.errorStatus, "PERMISSION_DENIED");
  });

  for (const authCase of [
    {
      name: "different email",
      options: { email: "wrong@example.test" }
    },
    {
      name: "unverified email",
      options: { emailVerified: false }
    },
    {
      name: "non-admin role",
      options: { role: "user" }
    },
    {
      name: "pending admin",
      options: { status: "pending" }
    },
    {
      name: "blocked admin",
      options: { status: "blocked" }
    },
    {
      name: "disabled Auth user",
      options: { disabledAfterSignIn: true }
    }
  ]) {
    await t.test(`${authCase.name} is rejected`, async () => {
      const result = await callApproval(
        await adminToken(authCase.options),
        nextId()
      );
      assert.equal(result.errorStatus, "PERMISSION_DENIED");
    });
  }

  const token = await adminToken();
  await t.test("missing application is rejected", async () => {
    const result = await callApproval(token, nextId());
    assert.equal(result.errorStatus, "NOT_FOUND");
  });

  await t.test("missing job is rejected", async () => {
    const id = await seed();
    await firestore.doc(`jobs/${id}`).delete();
    const result = await callApproval(token, id);
    assert.equal(result.errorStatus, "NOT_FOUND");
  });

  for (const failure of [
    {
      name: "ownerId mismatch",
      overrides: { job: { ownerId: OTHER_UID } }
    },
    {
      name: "storeId mismatch",
      overrides: { job: { storeId: OTHER_UID } }
    },
    {
      name: "missing store",
      overrides: { store: null }
    },
    {
      name: "missing contract",
      overrides: { contract: null }
    },
    {
      name: "unpaid",
      overrides: {
        contract: { paymentStatus: "awaiting_payment" }
      }
    },
    {
      name: "paused",
      overrides: {
        contract: { listingStatus: "paused" }
      }
    },
    {
      name: "expired",
      overrides: {
        contract: { listingStatus: "expired" }
      }
    },
    {
      name: "suspended",
      overrides: {
        contract: { listingStatus: "suspended" }
      }
    },
    {
      name: "outside period",
      overrides: {
        contract: {
          contractEndAt: Timestamp.fromMillis(Date.now() - 1_000)
        }
      }
    }
  ] as const) {
    await t.test(`${failure.name} changes nothing`, async () => {
      const id = await seed(failure.overrides);
      const result = await callApproval(token, id);
      assert.equal(result.errorStatus, "FAILED_PRECONDITION");
      await assertUnchanged(id);
    });
  }

  await t.test("valid approval updates both documents", async () => {
    const id = await seed();
    const result = await callApproval(token, id);
    assert.equal(result.status, 200);
    assert.equal(result.data?.approved, true);
    assert.equal(result.data?.idempotent, false);
    const [application, job] = await Promise.all([
      firestore.doc(`jobApplications/${id}`).get(),
      firestore.doc(`jobs/${id}`).get()
    ]);
    assert.equal(application.data()?.status, "approved");
    assert.equal(job.data()?.status, "approved");
    assert.equal(job.data()?.isPublic, true);

    const hash = createHash("sha256")
      .update(id, "utf8")
      .digest("hex");
    const audit = await firestore
      .doc(`adminAuditLogs/approve_job_${hash}`)
      .get();
    assert.equal(audit.data()?.targetHash, hash);
    assert.equal(audit.data()?.actionType, "approve_job_application");
    assert.equal("adminUid" in (audit.data() ?? {}), false);
    assert.equal("adminEmail" in (audit.data() ?? {}), false);
    assert.equal(
      (await firestore.collection("storeInvites").get()).empty,
      true
    );
  });

  await t.test("partial approval is completed", async () => {
    const id = await seed({
      application: { status: "approved" }
    });
    const result = await callApproval(token, id);
    assert.equal(result.status, 200);
    const job = await firestore.doc(`jobs/${id}`).get();
    assert.equal(job.data()?.status, "approved");
    assert.equal(job.data()?.isPublic, true);
  });

  await t.test("approved retry is idempotent", async () => {
    const id = await seed();
    assert.equal((await callApproval(token, id)).status, 200);
    const retry = await callApproval(token, id);
    assert.equal(retry.status, 200);
    assert.equal(retry.data?.idempotent, true);
    const hash = createHash("sha256")
      .update(id, "utf8")
      .digest("hex");
    const audits = await firestore
      .collection("adminAuditLogs")
      .where("targetHash", "==", hash)
      .get();
    assert.equal(audits.size, 1);
  });
});
