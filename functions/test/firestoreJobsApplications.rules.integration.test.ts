import assert from "node:assert/strict";
import { after, test } from "node:test";

import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import {
  FIXED_ADMIN_EMAIL,
  FIXED_ADMIN_UID
} from "../src/config";

const PROJECT_ID = "demo-nox-local";
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "";
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "";
const PASSWORD = "Test-password-123!";
const STORE_UID = "rulesJobStore";
const OTHER_STORE_UID = "rulesOtherStore";
const USER_UID = "rulesJobApplicant";
const PENDING_STORE_UID = "rulesPendingStore";
const BLOCKED_STORE_UID = "rulesBlockedStore";

if (
  process.env.GCLOUD_PROJECT !== PROJECT_ID ||
  !AUTH_HOST ||
  !FIRESTORE_HOST
) {
  throw new Error(
    "Job and application Rules tests require only demo-nox-local " +
      "Auth and Firestore Emulators."
  );
}

const app = initializeApp(
  { projectId: PROJECT_ID },
  "firestore-jobs-applications-rules"
);
const auth = getAuth(app);
const firestore = getFirestore(app);

type JsonValue =
  | null
  | boolean
  | number
  | string
  | Date
  | JsonValue[]
  | { [key: string]: JsonValue };

function encodeValue(value: JsonValue): Record<string, unknown> {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => encodeValue(item))
      }
    };
  }
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  return {
    mapValue: {
      fields: Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          encodeValue(item)
        ])
      )
    }
  };
}

function encodeFields(
  data: Record<string, JsonValue>,
  transforms: string[]
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([key]) => !transforms.includes(key))
      .map(([key, value]) => [key, encodeValue(value)])
  );
}

function documentName(path: string): string {
  return `projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
}

async function commitDocument(
  path: string,
  data: Record<string, JsonValue>,
  token: string,
  exists: boolean,
  transforms: string[]
): Promise<number> {
  const response = await fetch(
    `http://${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}` +
      "/databases/(default)/documents:commit",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        writes: [{
          update: {
            name: documentName(path),
            fields: encodeFields(data, transforms)
          },
          currentDocument: { exists },
          updateTransforms: transforms.map((fieldPath) => ({
            fieldPath,
            setToServerValue: "REQUEST_TIME"
          }))
        }]
      })
    }
  );
  return response.status;
}

async function requestDocument(
  path: string,
  method: "GET" | "DELETE",
  token?: string
): Promise<number> {
  const response = await fetch(
    `http://${FIRESTORE_HOST}/v1/${documentName(path)}`,
    {
      method,
      headers: token
        ? { Authorization: `Bearer ${token}` }
        : undefined
    }
  );
  return response.status;
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

function jobData(
  ownerId: string,
  status = "draft"
): Record<string, JsonValue> {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    schemaVersion: 1,
    ownerId,
    storeId: ownerId,
    storeName: "Rules Test Store",
    title: "Rules Test Job",
    category: "service",
    targetGender: "all",
    position: "staff",
    area: "Tokyo",
    address: "",
    station: "",
    businessHours: "",
    salary: "",
    trial: "",
    beginner: true,
    description: "",
    requirements: "",
    benefits: "",
    imageStoragePaths: [],
    imageUrls: [],
    status,
    isPublic: status === "approved",
    contractListingStatus:
      status === "approved" ? "active" : "pending",
    createdAt: now,
    createdBy: ownerId,
    updatedAt: now,
    updatedBy: ownerId,
    approvedAt: status === "approved" ? now : null,
    approvedBy: status === "approved" ? FIXED_ADMIN_UID : null,
    pausedAt: null,
    pausedBy: null,
    reapprovalRequestedAt: null,
    archivedAt: null,
    archivedBy: null,
    sourceApplicationId: null
  };
}

function applicationData(
  jobId: string,
  storeId = STORE_UID
): Record<string, JsonValue> {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    schemaVersion: 1,
    jobId,
    storeId,
    applicantId: USER_UID,
    name: "Test Applicant",
    phone: "000-0000-0000",
    message: "Test",
    status: "new",
    createdAt: now,
    updatedAt: now,
    contactedAt: null,
    interviewScheduledAt: null,
    hiredAt: null,
    rejectedAt: null
  };
}

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

after(async () => {
  const collections = [
    "applications",
    "jobs",
    "stores",
    "users"
  ];
  for (const collection of collections) {
    const snapshot = await firestore.collection(collection).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
  await Promise.all(
    [
      STORE_UID,
      OTHER_STORE_UID,
      USER_UID,
      PENDING_STORE_UID,
      BLOCKED_STORE_UID,
      FIXED_ADMIN_UID
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

test("canonical jobs and applications security boundaries", async (t) => {
  await createIdentity(
    STORE_UID,
    "job-store@example.test",
    "store",
    "active"
  );
  await createIdentity(
    OTHER_STORE_UID,
    "other-store@example.test",
    "store",
    "active"
  );
  await createIdentity(
    USER_UID,
    "applicant@example.test",
    "user",
    "active"
  );
  await createIdentity(
    PENDING_STORE_UID,
    "pending-store@example.test",
    "store",
    "pending"
  );
  await createIdentity(
    BLOCKED_STORE_UID,
    "blocked-store@example.test",
    "store",
    "blocked"
  );
  await createIdentity(
    FIXED_ADMIN_UID,
    FIXED_ADMIN_EMAIL,
    "admin",
    "active"
  );

  for (const uid of [
    STORE_UID,
    OTHER_STORE_UID,
    PENDING_STORE_UID,
    BLOCKED_STORE_UID
  ]) {
    await firestore.doc(`stores/${uid}`).set({
      ownerId: uid,
      storeName: "Same Display Name"
    });
  }

  const storeToken = await signIn("job-store@example.test");
  const otherStoreToken = await signIn("other-store@example.test");
  const userToken = await signIn("applicant@example.test");
  const pendingToken = await signIn("pending-store@example.test");
  const blockedToken = await signIn("blocked-store@example.test");

  await t.test("store profile edit succeeds but publication cache edit fails", async () => {
    const storeProfile: Record<string, JsonValue> = {
      ownerId: STORE_UID,
      storeName: "Same Display Name"
    };
    assert.equal(
      await commitDocument(
        `stores/${STORE_UID}`,
        {
          ...storeProfile,
          description: "Safe profile update"
        },
        storeToken,
        true,
        ["updatedAt"]
      ),
      200
    );
    assert.equal(
      await commitDocument(
        `stores/${STORE_UID}`,
        {
          ...storeProfile,
          description: "Safe profile update",
          isPublic: true,
          contractListingStatus: "active",
          contractEndAt: new Date()
        },
        storeToken,
        true,
        ["updatedAt"]
      ),
      403
    );
  });

  await t.test("active owner creates only its own draft", async () => {
    assert.equal(
      await commitDocument(
        "jobs/draft-create",
        jobData(STORE_UID),
        storeToken,
        false,
        ["createdAt", "updatedAt"]
      ),
      200
    );
    const wrongOwner = jobData(OTHER_STORE_UID);
    assert.equal(
      await commitDocument(
        "jobs/wrong-owner",
        wrongOwner,
        storeToken,
        false,
        ["createdAt", "updatedAt"]
      ),
      403
    );
  });

  await t.test("general, anonymous, pending and blocked cannot create jobs", async () => {
    assert.equal(
      await commitDocument(
        "jobs/user-create",
        jobData(USER_UID),
        userToken,
        false,
        ["createdAt", "updatedAt"]
      ),
      403
    );
    for (const [uid, token] of [
      [PENDING_STORE_UID, pendingToken],
      [BLOCKED_STORE_UID, blockedToken]
    ] as const) {
      assert.equal(
        await commitDocument(
          `jobs/${uid}`,
          jobData(uid),
          token,
          false,
          ["createdAt", "updatedAt"]
        ),
        403
      );
    }
  });

  const approved = jobData(STORE_UID, "approved");
  await firestore.doc("jobs/approved-job").set(approved);
  await firestore.doc("jobs/private-job").set({
    ...approved,
    isPublic: false
  });
  await firestore.doc("jobs/other-job").set(
    jobData(OTHER_STORE_UID, "approved")
  );

  await t.test("public reads only approved active public jobs", async () => {
    assert.equal(
      await requestDocument("jobs/approved-job", "GET"),
      200
    );
    assert.equal(
      await requestDocument("jobs/private-job", "GET"),
      403
    );
  });

  await t.test("same store name grants no ownership", async () => {
    assert.equal(
      await requestDocument(
        "jobs/other-job",
        "GET",
        storeToken
      ),
      200
    );
    const hiddenOther = {
      ...jobData(OTHER_STORE_UID, "paused"),
      isPublic: false,
      contractListingStatus: "active"
    };
    await firestore.doc("jobs/hidden-other").set(hiddenOther);
    assert.equal(
      await requestDocument(
        "jobs/hidden-other",
        "GET",
        storeToken
      ),
      403
    );
  });

  await t.test("other stores and immutable UID/cache edits are rejected", async () => {
    const ownDraft = jobData(STORE_UID);
    await firestore.doc("jobs/edit-draft").set(ownDraft);
    assert.equal(
      await commitDocument(
        "jobs/edit-draft",
        { ...ownDraft, title: "Other edit" },
        otherStoreToken,
        true,
        ["updatedAt"]
      ),
      403
    );
    assert.equal(
      await commitDocument(
        "jobs/edit-draft",
        {
          ...ownDraft,
          ownerId: OTHER_STORE_UID,
          storeId: OTHER_STORE_UID
        },
        storeToken,
        true,
        ["updatedAt"]
      ),
      403
    );
    assert.equal(
      await commitDocument(
        "jobs/edit-draft",
        { ...ownDraft, isPublic: true },
        storeToken,
        true,
        ["updatedAt"]
      ),
      403
    );
  });

  await t.test("approved pauses but cannot remain approved while edited", async () => {
    const paused = {
      ...approved,
      status: "paused",
      pausedBy: STORE_UID
    };
    assert.equal(
      await commitDocument(
        "jobs/approved-job",
        paused,
        storeToken,
        true,
        ["updatedAt", "pausedAt"]
      ),
      200
    );

    await firestore.doc("jobs/approved-edit").set(approved);
    assert.equal(
      await commitDocument(
        "jobs/approved-edit",
        { ...approved, title: "Unsafe live edit" },
        storeToken,
        true,
        ["updatedAt"]
      ),
      403
    );
  });

  await t.test("paused requests reapproval but cannot approve itself", async () => {
    const paused = {
      ...jobData(STORE_UID, "paused"),
      isPublic: false,
      contractListingStatus: "active",
      pausedAt: new Date("2026-01-02T00:00:00.000Z"),
      pausedBy: STORE_UID
    };
    await firestore.doc("jobs/paused-job").set(paused);
    assert.equal(
      await commitDocument(
        "jobs/paused-job",
        { ...paused, status: "reapproval_pending" },
        storeToken,
        true,
        ["updatedAt", "reapprovalRequestedAt"]
      ),
      200
    );
    await firestore.doc("jobs/paused-direct").set(paused);
    assert.equal(
      await commitDocument(
        "jobs/paused-direct",
        { ...paused, status: "approved" },
        storeToken,
        true,
        ["updatedAt"]
      ),
      403
    );
  });

  await t.test("pending cannot self-approve", async () => {
    const pending = jobData(STORE_UID, "pending");
    await firestore.doc("jobs/pending-job").set(pending);
    assert.equal(
      await commitDocument(
        "jobs/pending-job",
        { ...pending, status: "approved" },
        storeToken,
        true,
        ["updatedAt"]
      ),
      403
    );
  });

  await t.test("draft may be submitted as pending", async () => {
    const draft = jobData(STORE_UID);
    await firestore.doc("jobs/submit-draft").set(draft);
    assert.equal(
      await commitDocument(
        "jobs/submit-draft",
        { ...draft, status: "pending" },
        storeToken,
        true,
        ["updatedAt"]
      ),
      200
    );
  });

  await t.test("logical archive succeeds, delete and restore fail", async () => {
    const draft = jobData(STORE_UID);
    await firestore.doc("jobs/archive-job").set(draft);
    const archived = {
      ...draft,
      status: "archived",
      archivedBy: STORE_UID
    };
    assert.equal(
      await commitDocument(
        "jobs/archive-job",
        archived,
        storeToken,
        true,
        ["updatedAt", "archivedAt"]
      ),
      200
    );
    assert.equal(
      await requestDocument("jobs/archive-job", "DELETE", storeToken),
      403
    );
    const storedArchived = {
      ...archived,
      archivedAt: new Date()
    };
    await firestore.doc("jobs/restore-job").set(storedArchived);
    assert.equal(
      await commitDocument(
        "jobs/restore-job",
        { ...storedArchived, status: "draft" },
        storeToken,
        true,
        ["updatedAt"]
      ),
      403
    );
  });

  await t.test("applicant creates only a canonical owned application", async () => {
    await firestore.doc("jobs/application-job").set(
      jobData(STORE_UID, "approved")
    );
    assert.equal(
      await commitDocument(
        "applications/new-application",
        applicationData("application-job"),
        userToken,
        false,
        ["createdAt", "updatedAt"]
      ),
      200
    );
    assert.equal(
      await commitDocument(
        "applications/wrong-applicant",
        {
          ...applicationData("approved-job"),
          applicantId: "someone-else"
        },
        userToken,
        false,
        ["createdAt", "updatedAt"]
      ),
      403
    );
    assert.equal(
      await commitDocument(
        "applications/wrong-store",
        applicationData("approved-job", OTHER_STORE_UID),
        userToken,
        false,
        ["createdAt", "updatedAt"]
      ),
      403
    );
  });

  await t.test("only destination store reads the application", async () => {
    assert.equal(
      await requestDocument(
        "applications/new-application",
        "GET",
        storeToken
      ),
      200
    );
    assert.equal(
      await requestDocument(
        "applications/new-application",
        "GET",
        otherStoreToken
      ),
      403
    );
  });

  await t.test("valid application workflow succeeds", async () => {
    let application = applicationData("application-job");
    await firestore.doc("applications/workflow").set(application);
    application = {
      ...application,
      status: "contacted"
    };
    assert.equal(
      await commitDocument(
        "applications/workflow",
        application,
        storeToken,
        true,
        ["updatedAt", "contactedAt"]
      ),
      200
    );
    application.contactedAt = new Date();
    application.status = "interview_scheduled";
    assert.equal(
      await commitDocument(
        "applications/workflow",
        application,
        storeToken,
        true,
        ["updatedAt", "interviewScheduledAt"]
      ),
      200
    );
    application.interviewScheduledAt = new Date();
    application.status = "hired";
    assert.equal(
      await commitDocument(
        "applications/workflow",
        application,
        storeToken,
        true,
        ["updatedAt", "hiredAt"]
      ),
      200
    );
  });

  await t.test("new application may be rejected and remains terminal", async () => {
    let application = applicationData("application-job");
    await firestore.doc("applications/rejected-workflow").set(
      application
    );
    application = {
      ...application,
      status: "rejected"
    };
    assert.equal(
      await commitDocument(
        "applications/rejected-workflow",
        application,
        storeToken,
        true,
        ["updatedAt", "rejectedAt"]
      ),
      200
    );
  });

  await t.test("invalid status, missing updatedAt and field tampering fail", async () => {
    const initial = applicationData("application-job");
    await firestore.doc("applications/invalid").set(initial);
    assert.equal(
      await commitDocument(
        "applications/invalid",
        { ...initial, status: "progress" },
        storeToken,
        true,
        ["updatedAt"]
      ),
      403
    );
    assert.equal(
      await commitDocument(
        "applications/invalid",
        {
          ...initial,
          status: "contacted",
          contactedAt: new Date()
        },
        storeToken,
        true,
        []
      ),
      403
    );
    assert.equal(
      await commitDocument(
        "applications/invalid",
        {
          ...initial,
          status: "contacted",
          name: "Tampered"
        },
        storeToken,
        true,
        ["updatedAt", "contactedAt"]
      ),
      403
    );
  });

  await t.test("terminal application states cannot be restored", async () => {
    const hired = {
      ...applicationData("application-job"),
      status: "hired",
      hiredAt: new Date()
    };
    await firestore.doc("applications/terminal").set(hired);
    assert.equal(
      await commitDocument(
        "applications/terminal",
        { ...hired, status: "contacted" },
        storeToken,
        true,
        ["updatedAt", "contactedAt"]
      ),
      403
    );
  });
});
