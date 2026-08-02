import assert from "node:assert/strict";
import test, { after } from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const PROJECT_ID = "demo-nox-local";
const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "";
const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "";
const PASSWORD = "Test-password-123!";
const USERS = [
  { uid: "phoneIdentityRulesUser", email: "phone-identity-rules@example.test" },
  { uid: "coinRulesStore", email: "coin-rules-store@example.test" },
  { uid: "MkIUfZ4JFEhRTUzEKPPNxKo0gut1", email: "watabaseball00@gmail.com" },
];

if (!AUTH_EMULATOR_HOST || !FIRESTORE_EMULATOR_HOST) {
  throw new Error("Rules tests require the Auth and Firestore Emulators.");
}

const app = initializeApp({ projectId: PROJECT_ID }, "phone-identity-rules");
const auth = getAuth(app);

async function getIdToken(user: typeof USERS[number]): Promise<string> {
  try {
    await auth.createUser({ uid: user.uid, email: user.email, password: PASSWORD });
  } catch {
    // Reuse the emulator fixture when the test is repeated.
  }
  const response = await fetch(
    `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/` +
      "accounts:signInWithPassword?key=fake-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password: PASSWORD, returnSecureToken: true }),
    },
  );
  const payload = await response.json() as { idToken?: string };
  assert.equal(response.ok, true);
  assert.ok(payload.idToken);
  return payload.idToken;
}

async function requestDocument(
  collection: string,
  method: "GET" | "PATCH",
  idToken?: string,
): Promise<Response> {
  return fetch(
    `http://${FIRESTORE_EMULATOR_HOST}/v1/projects/${PROJECT_ID}/` +
      `databases/(default)/documents/${collection}/identity-hash`,
    {
      method,
      headers: {
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        "Content-Type": "application/json",
      },
      body: method === "PATCH"
        ? JSON.stringify({ fields: { uid: { stringValue: USERS[0].uid } } })
        : undefined,
    },
  );
}

after(async () => {
  await Promise.all(USERS.map((user) => auth.deleteUser(user.uid).catch(() => undefined)));
  await deleteApp(app);
});

for (const collection of [
  "phoneIdentities",
  "slotPlayerStates",
  "deletedAccountSafeguards",
  "coinWallets",
  "coinLots",
  "coinLedger",
  "coinOperations",
  "coinPaymentClaims",
]) {
  test(`${collection} denies browser reads and writes`, async () => {
    const idToken = await getIdToken(USERS[0]);
    assert.equal((await requestDocument(collection, "GET", idToken)).status, 403);
    assert.equal((await requestDocument(collection, "PATCH", idToken)).status, 403);
  });
}

for (const collection of [
  "coinWallets",
  "coinLots",
  "coinLedger",
  "coinOperations",
  "coinPaymentClaims",
]) {
  test(`${collection} rejects unauthenticated, member, store, and admin browsers`, async () => {
    const tokens = [
      undefined,
      await getIdToken(USERS[0]),
      await getIdToken(USERS[1]),
      await getIdToken(USERS[2]),
    ];
    for (const token of tokens) {
      assert.equal((await requestDocument(collection, "GET", token)).status, 403);
      assert.equal((await requestDocument(collection, "PATCH", token)).status, 403);
    }
  });
}
