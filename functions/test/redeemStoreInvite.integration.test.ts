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
  generateInviteTokenMaterial
} from "../src/security/inviteToken";

import type {
  BusinessScope
} from "../src/types/storeInvite";

const PROJECT_ID = "demo-nox-local";
const AUTH_EMULATOR_HOST =
  "127.0.0.1:9099";
const FUNCTION_URL =
  "http://127.0.0.1:5001/" +
  `${PROJECT_ID}/asia-northeast1/` +
  "redeemStoreInvite";

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
  "redeem-store-invite-tests"
);
const firestore = getFirestore(app);
const auth = getAuth(app);

const createdDocumentPaths =
  new Set<string>();
const createdUserIds =
  new Set<string>();
let sequence = 0;

interface TestIdentity {
  uid: string;
  email: string;
  idToken: string;
}

interface InviteFixture {
  token: string;
  tokenHash: string;
  applicationId: string;
  invitePath: string;
  applicationPath: string;
}

interface CallableResponse {
  status: number;
  result?: {
    redeemed?: boolean;
    alreadyRedeemed?: boolean;
  };
  error?: {
    status?: string;
    details?: {
      reason?: string;
    };
  };
}

async function signIn(
  email: string,
  password: string
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
        password,
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

async function createIdentity(
  options: {
    verified?: boolean;
    role?: string;
    status?: string;
    email?: string;
  } = {}
): Promise<TestIdentity> {
  sequence += 1;
  const email =
    options.email ??
    `redeem-test-${sequence}@example.test`;
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

  const verified =
    options.verified !== false;

  if (verified) {
    await auth.updateUser(
      payload.localId,
      { emailVerified: true }
    );
  }

  const idToken = verified
    ? await signIn(email, password)
    : payload.idToken;

  createdUserIds.add(payload.localId);

  const userPath =
    `users/${payload.localId}`;
  await firestore.doc(userPath).set({
    role: options.role ?? "user",
    status: options.status ?? "pending"
  });
  createdDocumentPaths.add(userPath);

  return {
    uid: payload.localId,
    email,
    idToken
  };
}

async function createInvite(
  email: string,
  overrides: {
    invite?: Record<string, unknown>;
    application?: Record<string, unknown>;
    businessScope?: BusinessScope;
  } = {}
): Promise<InviteFixture> {
  sequence += 1;
  const material =
    generateInviteTokenMaterial();
  const applicationId =
    `redeemStoreApplication${sequence}`;
  const invitePath =
    `storeInvites/${material.tokenHash}`;
  const applicationPath =
    `storeApplications/${applicationId}`;
  const businessScope =
    overrides.businessScope ?? "night";

  await firestore.doc(applicationPath).set({
    storeName: "NOX Test Store",
    businessScope,
    businessType: "Test Business",
    area: "Tokyo",
    address: "Test Address",
    status: "approved",
    inviteId: material.tokenHash,
    inviteStatus: "active",
    ...overrides.application
  });
  await firestore.doc(invitePath).set({
    sourceStoreApplicationId:
      applicationId,
    storeName: "NOX Test Store",
    invitedEmail: email,
    businessScope,
    status: "issued",
    used: false,
    expiresAt: Timestamp.fromMillis(
      Date.now() + 60 * 60 * 1000
    ),
    ...overrides.invite
  });

  createdDocumentPaths.add(
    applicationPath
  );
  createdDocumentPaths.add(invitePath);

  return {
    token: material.token,
    tokenHash: material.tokenHash,
    applicationId,
    invitePath,
    applicationPath
  };
}

async function callRedeem(
  inviteToken: string,
  idToken?: string,
  ownerName = "Test Owner"
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
        data: {
          inviteToken,
          ownerName
        }
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

function trackStore(uid: string): void {
  createdDocumentPaths.add(
    `stores/${uid}`
  );
}

before(() => {
  assert.equal(
    process.env.GCLOUD_PROJECT,
    PROJECT_ID
  );
});

after(async () => {
  await Promise.all(
    [...createdDocumentPaths].map(
      (path) =>
        firestore.doc(path).delete()
    )
  );
  await Promise.all(
    [...createdUserIds].map(
      (uid) => auth.deleteUser(uid)
    )
  );
  await deleteApp(app);
});

test(
  "requires authentication and verified email",
  async () => {
    const identity =
      await createIdentity({
        verified: false
      });
    const invite =
      await createInvite(identity.email);

    const unauthenticated =
      await callRedeem(invite.token);
    assert.equal(
      unauthenticated.error?.status,
      "UNAUTHENTICATED"
    );

    const unverified =
      await callRedeem(
        invite.token,
        identity.idToken
      );
    assert.equal(
      unverified.error?.details?.reason,
      "email-not-verified"
    );
  }
);

for (
  const businessScope of [
    "night",
    "general",
    "both"
  ] as const satisfies readonly BusinessScope[]
) {
  test(
    `redeems a ${businessScope} invite atomically`,
    async () => {
      const identity =
        await createIdentity();
      const invite =
        await createInvite(
          identity.email,
          { businessScope }
        );
      trackStore(identity.uid);

      const response =
        await callRedeem(
          invite.token,
          identity.idToken
        );

      assert.deepEqual(response.result, {
        redeemed: true,
        alreadyRedeemed: false
      });

      const [
        userSnapshot,
        storeSnapshot,
        inviteSnapshot,
        applicationSnapshot
      ] = await Promise.all([
        firestore
          .doc(`users/${identity.uid}`)
          .get(),
        firestore
          .doc(`stores/${identity.uid}`)
          .get(),
        firestore.doc(invite.invitePath).get(),
        firestore
          .doc(invite.applicationPath)
          .get()
      ]);

      assert.equal(
        userSnapshot.get("role"),
        "store"
      );
      assert.equal(
        userSnapshot.get("status"),
        "active"
      );
      assert.equal(
        storeSnapshot.get("ownerId"),
        identity.uid
      );
      assert.equal(
        storeSnapshot.get("businessScope"),
        businessScope
      );
      assert.equal(
        inviteSnapshot.get("used"),
        true
      );
      assert.equal(
        inviteSnapshot.get("registeredUid"),
        identity.uid
      );
      assert.equal(
        applicationSnapshot.get(
          "registeredOwnerId"
        ),
        identity.uid
      );
    }
  );
}

test(
  "rejects email mismatch and invalid user states",
  async () => {
    const identity =
      await createIdentity();
    const wrongEmailInvite =
      await createInvite(
        "different@example.test"
      );
    const mismatch =
      await callRedeem(
        wrongEmailInvite.token,
        identity.idToken
      );
    assert.equal(
      mismatch.error?.details?.reason,
      "invalid-invite"
    );

    for (
      const [role, status] of [
        ["admin", "active"],
        ["store", "active"],
        ["user", "blocked"]
      ]
    ) {
      const invalidIdentity =
        await createIdentity({
          role,
          status
        });
      const invite =
        await createInvite(
          invalidIdentity.email
        );
      const response =
        await callRedeem(
          invite.token,
          invalidIdentity.idToken
        );

      assert.equal(
        response.error?.details?.reason,
        "user-not-pending"
      );
    }
  }
);

test(
  "rejects invalid scope and rolls back all writes",
  async () => {
    const identity =
      await createIdentity();
    const invite =
      await createInvite(identity.email, {
        invite: {
          businessScope: "unknown"
        }
      });

    const response =
      await callRedeem(
        invite.token,
        identity.idToken
      );
    const [
      userSnapshot,
      storeSnapshot,
      inviteSnapshot,
      applicationSnapshot
    ] = await Promise.all([
      firestore
        .doc(`users/${identity.uid}`)
        .get(),
      firestore
        .doc(`stores/${identity.uid}`)
        .get(),
      firestore.doc(invite.invitePath).get(),
      firestore
        .doc(invite.applicationPath)
        .get()
    ]);

    assert.equal(
      response.error?.details?.reason,
      "registration-data-integrity"
    );
    assert.equal(
      userSnapshot.get("role"),
      "user"
    );
    assert.equal(storeSnapshot.exists, false);
    assert.equal(
      inviteSnapshot.get("used"),
      false
    );
    assert.equal(
      applicationSnapshot.get(
        "registeredOwnerId"
      ),
      undefined
    );
  }
);

test(
  "returns an idempotent success for the same uid",
  async () => {
    const identity =
      await createIdentity();
    const invite =
      await createInvite(identity.email);
    trackStore(identity.uid);

    const first =
      await callRedeem(
        invite.token,
        identity.idToken
      );
    const second =
      await callRedeem(
        invite.token,
        identity.idToken
      );

    assert.equal(
      first.result?.alreadyRedeemed,
      false
    );
    assert.deepEqual(second.result, {
      redeemed: true,
      alreadyRedeemed: true
    });
  }
);

test(
  "rejects reuse by a different uid",
  async () => {
    const owner =
      await createIdentity();
    const other =
      await createIdentity();
    const invite =
      await createInvite(owner.email);
    trackStore(owner.uid);

    await callRedeem(
      invite.token,
      owner.idToken
    );
    const response =
      await callRedeem(
        invite.token,
        other.idToken
      );

    assert.equal(
      response.error?.details?.reason,
      "invalid-invite"
    );
    assert.equal(
      (
        await firestore
          .doc(`stores/${other.uid}`)
          .get()
      ).exists,
      false
    );
  }
);

test(
  "handles concurrent redemption by one uid",
  async () => {
    const identity =
      await createIdentity();
    const invite =
      await createInvite(identity.email);
    trackStore(identity.uid);

    const responses =
      await Promise.all([
        callRedeem(
          invite.token,
          identity.idToken
        ),
        callRedeem(
          invite.token,
          identity.idToken
        )
      ]);

    assert.equal(
      responses.every(
        (response) =>
          response.result?.redeemed === true
      ),
      true
    );
    assert.deepEqual(
      responses
        .map(
          (response) =>
            response.result?.alreadyRedeemed
        )
        .sort(),
      [false, true]
    );
  }
);
