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
  FieldValue,
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
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??
  "";
const FUNCTION_URL =
  "http://127.0.0.1:5001/" +
  `${PROJECT_ID}/asia-northeast1/` +
  "getStoreInvitePreview";

if (
  process.env.GCLOUD_PROJECT !== PROJECT_ID ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !AUTH_EMULATOR_HOST ||
  process.env.FUNCTIONS_EMULATOR !== "true"
) {
  throw new Error(
    "Integration tests require the demo-nox-local " +
    "Auth, Firestore, and Functions Emulators."
  );
}

const app = initializeApp(
  {
    projectId: PROJECT_ID
  },
  "get-store-invite-preview-tests"
);

const firestore = getFirestore(app);
const auth = getAuth(app);

const createdDocumentPaths: string[] = [];
const createdUserIds: string[] = [];

interface CallableResponse {
  status: number;
  result?: Record<string, unknown>;
  error?: {
    status?: string;
    message?: string;
  };
}

async function callPreview(
  data: Record<string, unknown>,
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
      body: JSON.stringify({ data })
    }
  );

  const payload =
    await response.json() as {
      data?: Record<string, unknown>;
      result?: Record<string, unknown>;
      error?: CallableResponse["error"];
    };

  return {
    status: response.status,
    result:
      payload.data ??
      payload.result,
    error: payload.error
  };
}

async function createIdentity(
  email: string
): Promise<string> {
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

  return payload.idToken;
}

async function createInvite(
  overrides: Record<string, unknown> = {}
): Promise<{
  inviteToken: string;
  documentPath: string;
}> {
  const material =
    generateInviteTokenMaterial();

  const documentPath =
    `storeInvites/${material.tokenHash}`;

  await firestore
    .doc(documentPath)
    .set({
      status: "issued",
      used: false,
      expiresAt:
        Timestamp.fromMillis(
          Date.now() + 60 * 60 * 1000
        ),
      storeName: "NOX Test Store",
      invitedEmail:
        "watabaseball00@gmail.com",
      businessScope: "night",
      ...overrides
    });

  createdDocumentPaths.push(documentPath);

  return {
    inviteToken: material.token,
    documentPath
  };
}

function assertGenericInvalidInvite(
  response: CallableResponse
): void {
  assert.equal(
    response.error?.status,
    "NOT_FOUND"
  );
  assert.equal(
    response.error?.message,
    "The invite is invalid or unavailable."
  );
}

before(() => {
  assert.match(
    process.env.FIRESTORE_EMULATOR_HOST ?? "",
    /^(127\.0\.0\.1|localhost):8080$/
  );
});

after(async () => {
  await Promise.all(
    createdDocumentPaths.map(
      (documentPath) =>
        firestore.doc(documentPath).delete()
    )
  );

  await Promise.all(
    createdUserIds.map(
      (uid) => auth.deleteUser(uid)
    )
  );

  await deleteApp(app);
});

for (
  const businessScope of [
    "night",
    "general",
    "both"
  ] as const satisfies readonly BusinessScope[]
) {
  test(
    `returns a safe preview for ${businessScope}`,
    async () => {
      const invite =
        await createInvite({
          businessScope
        });

      const beforeSnapshot =
        await firestore
          .doc(invite.documentPath)
          .get();

      const response =
        await callPreview({
          inviteToken:
            invite.inviteToken
        });

      assert.equal(response.status, 200);
      assert.deepEqual(
        Object.keys(response.result ?? {})
          .sort(),
        [
          "businessScope",
          "emailHint",
          "expiresAt",
          "storeName",
          "valid"
        ]
      );
      assert.equal(
        response.result?.valid,
        true
      );
      assert.equal(
        response.result?.businessScope,
        businessScope
      );
      assert.equal(
        response.result?.storeName,
        "NOX Test Store"
      );
      assert.equal(
        response.result?.emailHint,
        "w***@g***.com"
      );

      const afterSnapshot =
        await firestore
          .doc(invite.documentPath)
          .get();

      assert.deepEqual(
        afterSnapshot.data(),
        beforeSnapshot.data()
      );
    }
  );
}

test(
  "defaults a missing businessScope to night",
  async () => {
    const invite =
      await createInvite();

    await firestore
      .doc(invite.documentPath)
      .update({
        businessScope:
          FieldValue.delete()
      });

    const response =
      await callPreview({
        inviteToken:
          invite.inviteToken
      });

    assert.equal(
      response.result?.businessScope,
      "night"
    );
  }
);

test(
  "returns the same safe error for unavailable invites",
  async () => {
    const expired =
      await createInvite({
        expiresAt:
          Timestamp.fromMillis(
            Date.now() - 1000
          )
      });

    const used =
      await createInvite({
        used: true
      });

    const revoked =
      await createInvite({
        status: "revoked"
      });

    const unknownScope =
      await createInvite({
        businessScope: "unknown"
      });

    const missing =
      generateInviteTokenMaterial();

    const responses =
      await Promise.all([
        callPreview({
          inviteToken:
            expired.inviteToken
        }),
        callPreview({
          inviteToken:
            used.inviteToken
        }),
        callPreview({
          inviteToken:
            revoked.inviteToken
        }),
        callPreview({
          inviteToken:
            unknownScope.inviteToken
        }),
        callPreview({
          inviteToken:
            missing.token
        })
      ]);

    responses.forEach(
      assertGenericInvalidInvite
    );
  }
);

test(
  "rejects malformed input before lookup",
  async () => {
    const invalidInputs = [
      {},
      { inviteToken: "" },
      { inviteToken: "a".repeat(42) },
      { inviteToken: "a".repeat(44) },
      { inviteToken: "a".repeat(42) + "=" },
      {
        inviteToken: "a".repeat(43),
        extra: true
      }
    ];

    for (const input of invalidInputs) {
      const response =
        await callPreview(input);

      assert.equal(
        response.error?.status,
        "INVALID_ARGUMENT"
      );
      assert.equal(
        response.error?.message,
        "The invite token format is invalid."
      );
    }
  }
);

test(
  "does not return the email or token material",
  async () => {
    const invite =
      await createInvite({
        businessScope: "general"
      });

    const response =
      await callPreview({
        inviteToken:
          invite.inviteToken
      });

    const serialized =
      JSON.stringify(response.result);

    assert.equal(
      serialized.includes(
        "watabaseball00@gmail.com"
      ),
      false
    );
    assert.equal(
      serialized.includes(
        invite.inviteToken
      ),
      false
    );
    assert.equal(
      serialized.includes(
        invite.documentPath.split("/")[1]
      ),
      false
    );
  }
);

test(
  "omits email match information when unauthenticated",
  async () => {
    const invite =
      await createInvite();

    const response =
      await callPreview({
        inviteToken:
          invite.inviteToken
      });

    assert.equal(response.status, 200);
    assert.equal(
      Object.hasOwn(
        response.result ?? {},
        "emailMatchesAuthenticatedUser"
      ),
      false
    );
  }
);

test(
  "returns true only for the authenticated invite email",
  async () => {
    const email =
      "preview-match@example.test";
    const idToken =
      await createIdentity(email);
    const invite =
      await createInvite({
        invitedEmail:
          "  PREVIEW-MATCH@EXAMPLE.TEST "
      });

    const response =
      await callPreview(
        {
          inviteToken:
            invite.inviteToken
        },
        idToken
      );

    assert.equal(response.status, 200);
    assert.equal(
      response.result
        ?.emailMatchesAuthenticatedUser,
      true
    );
  }
);

test(
  "returns false for a different authenticated email",
  async () => {
    const idToken =
      await createIdentity(
        "preview-other@example.test"
      );
    const invite =
      await createInvite({
        invitedEmail:
          "preview-invited@example.test"
      });

    const response =
      await callPreview(
        {
          inviteToken:
            invite.inviteToken
        },
        idToken
      );

    assert.equal(response.status, 200);
    assert.equal(
      response.result
        ?.emailMatchesAuthenticatedUser,
      false
    );

    const serialized =
      JSON.stringify(response.result);

    assert.equal(
      serialized.includes(
        "preview-other@example.test"
      ),
      false
    );
    assert.equal(
      serialized.includes(
        "preview-invited@example.test"
      ),
      false
    );
  }
);
