import assert from "node:assert/strict";
import {
  after,
  before,
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
  hashInviteToken
} from "../src/security/inviteToken";

const PROJECT_ID = "demo-nox-local";
const AUTH_EMULATOR_HOST =
  "127.0.0.1:9099";
const FUNCTION_URL =
  "http://127.0.0.1:5001/" +
  `${PROJECT_ID}/asia-northeast1/` +
  "approveStoreApplicationAndIssueInvite";

if (
  process.env.GCLOUD_PROJECT !== PROJECT_ID ||
  process.env.FIRESTORE_EMULATOR_HOST !==
    "127.0.0.1:8080" ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !==
    AUTH_EMULATOR_HOST
) {
  throw new Error(
    "Integration tests require only the " +
    "demo-nox-local Auth and Firestore Emulators."
  );
}

const app = initializeApp(
  { projectId: PROJECT_ID },
  "approve-store-application-tests"
);
const firestore = getFirestore(app);
const auth = getAuth(app);

const createdDocumentPaths: string[] = [];
const createdUserIds: string[] = [];
let applicationSequence = 0;

interface CallableResponse {
  status: number;
  result?: {
    inviteUrl?: string;
    expiresAt?: string;
  };
  error?: {
    status?: string;
    message?: string;
    details?: {
      reason?: string;
    };
  };
}

interface TestIdentity {
  uid: string;
  idToken: string;
}

async function createIdentity(
  role: string,
  status: string
): Promise<TestIdentity> {
  const sequence =
    createdUserIds.length + 1;
  const email =
    `approval-test-${sequence}@example.test`;
  const password = "Test-password-123!";

  const response = await fetch(
    `http://${AUTH_EMULATOR_HOST}/` +
      "identitytoolkit.googleapis.com/v1/" +
      "accounts:signUp?key=fake-key",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true
      })
    }
  );

  const payload =
    await response.json() as {
      localId?: string;
      idToken?: string;
    };

  assert.equal(response.ok, true);
  assert.ok(payload.localId);
  assert.ok(payload.idToken);

  createdUserIds.push(payload.localId);

  const userPath =
    `users/${payload.localId}`;

  await firestore.doc(userPath).set({
    role,
    status
  });
  createdDocumentPaths.push(userPath);

  return {
    uid: payload.localId,
    idToken: payload.idToken
  };
}

async function createApplication(
  overrides: Record<string, unknown> = {}
): Promise<string> {
  applicationSequence += 1;
  const applicationId =
    `storeApplicationTest${applicationSequence}`;
  const path =
    `storeApplications/${applicationId}`;

  await firestore.doc(path).set({
    storeName: "NOX Test Store",
    contactEmail: "  OWNER@EXAMPLE.COM  ",
    businessScope: "night",
    status: "pending",
    createdAt: Timestamp.now(),
    ...overrides
  });

  createdDocumentPaths.push(path);
  return applicationId;
}

async function callApproval(
  storeApplicationId: string,
  idToken?: string
): Promise<CallableResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (idToken) {
    headers.Authorization =
      `Bearer ${idToken}`;
  }

  const response = await fetch(
    FUNCTION_URL,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        data: { storeApplicationId }
      })
    }
  );

  const payload =
    await response.json() as {
      data?: CallableResponse["result"];
      result?: CallableResponse["result"];
      error?: CallableResponse["error"];
    };

  return {
    status: response.status,
    result: payload.data ?? payload.result,
    error: payload.error
  };
}

function inviteTokenFrom(
  inviteUrl: string
): string {
  const url = new URL(inviteUrl);

  assert.equal(
    url.origin + url.pathname,
    "https://joinnox.jp/pages/store-register.html"
  );

  const token =
    url.searchParams.get("invite");

  assert.ok(token);
  return token;
}

before(() => {
  assert.equal(
    process.env.GCLOUD_PROJECT,
    PROJECT_ID
  );
});

after(async () => {
  await Promise.all(
    createdDocumentPaths.map(
      (path) =>
        firestore.doc(path).delete()
    )
  );

  await Promise.all(
    createdUserIds.map(
      (uid) => auth.deleteUser(uid)
    )
  );

  await deleteApp(app);
});

test(
  "requires an authenticated active administrator",
  async () => {
    const applicationId =
      await createApplication();

    const unauthenticated =
      await callApproval(applicationId);

    assert.equal(
      unauthenticated.error?.status,
      "UNAUTHENTICATED"
    );

    for (
      const [role, status] of [
        ["user", "active"],
        ["store", "active"],
        ["admin", "pending"],
        ["admin", "blocked"]
      ]
    ) {
      const identity =
        await createIdentity(role, status);
      const response =
        await callApproval(
          applicationId,
          identity.idToken
        );

      assert.equal(
        response.error?.status,
        "PERMISSION_DENIED"
      );
    }
  }
);

for (
  const businessScope of [
    "night",
    "general",
    "both"
  ] as const
) {
  test(
    `approves and issues a ${businessScope} invite`,
    async () => {
      const admin =
        await createIdentity(
          "admin",
          "active"
        );
      const applicationId =
        await createApplication({
          businessScope
        });

      const response =
        await callApproval(
          applicationId,
          admin.idToken
        );

      assert.equal(response.status, 200);
      assert.ok(response.result?.inviteUrl);
      assert.ok(response.result.expiresAt);

      const token = inviteTokenFrom(
        response.result.inviteUrl
      );
      const tokenHash =
        hashInviteToken(token);
      const invitePath =
        `storeInvites/${tokenHash}`;
      createdDocumentPaths.push(invitePath);

      const [
        inviteSnapshot,
        applicationSnapshot
      ] = await Promise.all([
        firestore.doc(invitePath).get(),
        firestore
          .doc(
            `storeApplications/${applicationId}`
          )
          .get()
      ]);

      assert.deepEqual(
        Object.keys(
          inviteSnapshot.data() ?? {}
        ).sort(),
        [
          "businessScope",
          "createdAt",
          "createdBy",
          "expiresAt",
          "invitedEmail",
          "schemaVersion",
          "sourceStoreApplicationId",
          "status",
          "storeName",
          "used"
        ].sort()
      );
      assert.equal(
        inviteSnapshot.get("businessScope"),
        businessScope
      );
      assert.equal(
        inviteSnapshot.get("invitedEmail"),
        "owner@example.com"
      );
      assert.equal(
        inviteSnapshot.get(
          "sourceStoreApplicationId"
        ),
        applicationId
      );
      assert.equal(
        JSON.stringify(
          inviteSnapshot.data()
        ).includes(token),
        false
      );
      assert.equal(
        applicationSnapshot.get("status"),
        "approved"
      );
      assert.equal(
        applicationSnapshot.get("inviteId"),
        tokenHash
      );
      assert.equal(
        applicationSnapshot.get("approvedBy"),
        admin.uid
      );
    }
  );
}

test(
  "rejects invalid application state and data",
  async () => {
    const admin =
      await createIdentity(
        "admin",
        "active"
      );
    const cases = [
      {
        overrides: { status: "approved" },
        reason:
          "store-application-not-pending"
      },
      {
        overrides: {
          businessScope: "unknown"
        },
        reason: "store-application-invalid"
      },
      {
        overrides: { contactEmail: "" },
        reason: "store-application-invalid"
      },
      {
        overrides: {
          registeredOwnerId: "existing-owner"
        },
        reason:
          "store-application-already-registered"
      }
    ];

    for (const testCase of cases) {
      const applicationId =
        await createApplication(
          testCase.overrides
        );
      const response =
        await callApproval(
          applicationId,
          admin.idToken
        );

      assert.equal(
        response.error?.details?.reason,
        testCase.reason
      );
    }
  }
);

test(
  "rejects a second approval without changing data",
  async () => {
    const admin =
      await createIdentity(
        "admin",
        "active"
      );
    const applicationId =
      await createApplication();

    const first =
      await callApproval(
        applicationId,
        admin.idToken
      );
    assert.ok(first.result?.inviteUrl);

    const token = inviteTokenFrom(
      first.result.inviteUrl
    );
    const invitePath =
      `storeInvites/${hashInviteToken(token)}`;
    createdDocumentPaths.push(invitePath);

    const before =
      await firestore
        .doc(invitePath)
        .get();
    const second =
      await callApproval(
        applicationId,
        admin.idToken
      );
    const after =
      await firestore
        .doc(invitePath)
        .get();

    assert.equal(
      second.error?.details?.reason,
      "invite-already-issued"
    );
    assert.deepEqual(
      after.data(),
      before.data()
    );
  }
);

test(
  "allows only one concurrent approval",
  async () => {
    const admin =
      await createIdentity(
        "admin",
        "active"
      );
    const applicationId =
      await createApplication();

    const responses =
      await Promise.all([
        callApproval(
          applicationId,
          admin.idToken
        ),
        callApproval(
          applicationId,
          admin.idToken
        )
      ]);

    const successes = responses.filter(
      (response) =>
        Boolean(response.result?.inviteUrl)
    );
    const failures = responses.filter(
      (response) =>
        response.error?.details?.reason ===
        "invite-already-issued"
    );

    assert.equal(successes.length, 1);
    assert.equal(failures.length, 1);

    const token = inviteTokenFrom(
      successes[0].result?.inviteUrl ?? ""
    );
    createdDocumentPaths.push(
      `storeInvites/${hashInviteToken(token)}`
    );
  }
);

test(
  "does not approve when invite creation fails",
  async () => {
    const admin =
      await createIdentity(
        "admin",
        "active"
      );
    const applicationId =
      await createApplication({
        businessScope: "invalid"
      });

    const response =
      await callApproval(
        applicationId,
        admin.idToken
      );
    const snapshot =
      await firestore
        .doc(
          `storeApplications/${applicationId}`
        )
        .get();

    assert.equal(
      response.error?.details?.reason,
      "store-application-invalid"
    );
    assert.equal(
      snapshot.get("status"),
      "pending"
    );
    assert.equal(
      snapshot.get("inviteId"),
      undefined
    );
  }
);
