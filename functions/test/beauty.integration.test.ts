import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { FIXED_ADMIN_EMAIL, FIXED_ADMIN_UID } from "../src/config";

const PROJECT_ID = "demo-nox-local";
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "";
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || "";
const STORAGE_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST || "";
const FUNCTIONS_HOST = process.env.FUNCTIONS_EMULATOR_HOST
  || (process.env.FIREBASE_EMULATOR_HUB ? "127.0.0.1:5001" : "");
const PASSWORD = "Beauty-test-123!";
const USER_UID = "beautyGeneralUser";
const USER_EMAIL = "beauty-user@example.test";
const BUCKET = `${PROJECT_ID}.appspot.com`;

if (
  process.env.GCLOUD_PROJECT !== PROJECT_ID
  || !AUTH_HOST
  || !FIRESTORE_HOST
  || !STORAGE_HOST
  || !FUNCTIONS_HOST
) throw new Error("Beauty integration tests require only demo-nox-local emulators.");

const app = initializeApp({ projectId: PROJECT_ID }, "beauty-integration");
const auth = getAuth(app);
const firestore = getFirestore(app);
let userToken = "";
let adminToken = "";
let createdOrderId = "";

async function signIn(email: string) {
  const response = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }) }
  );
  const payload = await response.json() as { idToken?: string };
  assert.equal(response.ok, true, JSON.stringify(payload));
  assert.ok(payload.idToken);
  return payload.idToken;
}

function firestoreUrl(path: string) {
  return `http://${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
}

async function firestoreRequest(path: string, method: string, token?: string, body?: unknown) {
  return fetch(firestoreUrl(path), {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

function storageUrl(path: string, media = false) {
  return `http://${STORAGE_HOST}/v0/b/${BUCKET}/o/${encodeURIComponent(path)}${media ? "?alt=media" : ""}`;
}

async function upload(path: string, contentType: string, token?: string) {
  const boundary = "beauty-storage-boundary";
  const prefix = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: path, contentType })}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`);
  const suffix = Buffer.from(`\r\n--${boundary}--`);
  return fetch(`${storageUrl(path)}?uploadType=multipart`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "x-goog-upload-protocol": "multipart"
    },
    body: Buffer.concat([prefix, Buffer.alloc(64, 1), suffix])
  });
}

before(async () => {
  await Promise.all([
    auth.createUser({ uid: USER_UID, email: USER_EMAIL, emailVerified: true, password: PASSWORD }),
    auth.createUser({ uid: FIXED_ADMIN_UID, email: FIXED_ADMIN_EMAIL, emailVerified: true, password: PASSWORD })
  ]);
  await Promise.all([
    firestore.doc(`users/${USER_UID}`).set({ role: "user", status: "active" }),
    firestore.doc(`users/${FIXED_ADMIN_UID}`).set({ role: "admin", status: "active" }),
    firestore.doc("beautyBrands/mireio").set({ brandName: "MIRÈIO", isPublic: true }),
    firestore.doc("beautyProducts/mist").set({ brandId: "mireio", name: "MIST", price: 3600, isPublic: true, displayOrder: 1 }),
    firestore.doc("beautyProducts/private-product").set({ brandId: "mireio", name: "PRIVATE", price: 1, isPublic: false, displayOrder: 99 }),
    firestore.doc("beautySettings/commerce").set({ bankName: "TEST BANK", branchName: "TEST", accountType: "普通", accountNumber: "0000000", accountHolder: "TEST", paymentDueDays: 7, shippingLabel: "送料別途", salesEnabled: true })
  ]);
  [userToken, adminToken] = await Promise.all([signIn(USER_EMAIL), signIn(FIXED_ADMIN_EMAIL)]);
});

after(async () => {
  await deleteApp(app);
});

test("published catalog is public, private product is denied, writes are admin-only", async () => {
  assert.equal((await firestoreRequest("beautyProducts/mist", "GET")).status, 200);
  assert.equal((await firestoreRequest("beautyProducts/private-product", "GET")).status, 403);
  const body = { fields: { brandId: { stringValue: "mireio" }, name: { stringValue: "HACK" }, price: { integerValue: "1" }, isPublic: { booleanValue: true }, displayOrder: { integerValue: "1" } } };
  assert.equal((await firestoreRequest("beautyProducts/mist", "PATCH", userToken, body)).status, 403);
  assert.equal((await firestoreRequest("beautyProducts/mist", "PATCH", adminToken, body)).status, 200);
  await firestore.doc("beautyProducts/mist").set({ brandId: "mireio", name: "MIST", price: 3600, isPublic: true, displayOrder: 1 });
});

test("public clients cannot write beautyOrders directly", async () => {
  const body = { fields: { orderId: { stringValue: "forged" }, total: { integerValue: "1" } } };
  assert.equal((await firestoreRequest("beautyOrders/forged", "PATCH", userToken, body)).status, 403);
});

test("fixed admin can upload/delete beauty image and MP4; general user cannot", async () => {
  for (const [name, type] of [["hero.jpg", "image/jpeg"], ["hero.mp4", "video/mp4"]] as const) {
    const path = `beauty/mireio/brand/${name}`;
    assert.equal((await upload(path, type, userToken)).status, 403);
    assert.equal((await upload(path, type, adminToken)).status, 200);
    assert.equal((await fetch(storageUrl(path, true))).status, 200);
    assert.equal((await fetch(storageUrl(path), { method: "DELETE", headers: { Authorization: `Bearer ${userToken}` } })).status, 403);
    assert.equal((await fetch(storageUrl(path), { method: "DELETE", headers: { Authorization: `Bearer ${adminToken}` } })).status, 204);
  }
});

test("submitBeautyOrder reads server price, saves order, issues ID and returns bank instructions", async () => {
  const response = await fetch(`http://${FUNCTIONS_HOST}/${PROJECT_ID}/asia-northeast1/submitBeautyOrder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: {
      productId: "mist", quantity: 1, price: 1, unitPrice: 1,
      customerName: "テスト 花子", customerKana: "テスト ハナコ", postalCode: "100-0001",
      address: "東京都千代田区テスト1-1", phone: "09012345678", email: "beauty-order@example.test",
      note: "integration", agreed: true, requestId: "beauty-integration-order"
    } })
  });
  const payload = await response.json() as { result?: { orderId?: string; subtotal?: number; paymentInstructions?: { bankName?: string } }; error?: unknown };
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.ok(payload.result?.orderId);
  assert.equal(payload.result.subtotal, 3600);
  assert.equal(payload.result.paymentInstructions?.bankName, "TEST BANK");
  createdOrderId = payload.result.orderId!;
  const saved = (await firestore.doc(`beautyOrders/${createdOrderId}`).get()).data()!;
  assert.equal(saved.unitPrice, 3600);
  assert.equal(saved.subtotal, 3600);
  assert.equal(saved.noxReward, 720);
  assert.equal(saved.mireioSettlement, 2880);
  assert.equal(saved.orderStatus, "received");
});

test("administrator can complete the full order status cycle", async () => {
  for (const status of ["awaiting_payment", "paid", "fulfillment_requested", "shipped", "completed"]) {
    const body = { fields: { orderStatus: { stringValue: status } } };
    const response = await fetch(`${firestoreUrl(`beautyOrders/${createdOrderId}`)}?updateMask.fieldPaths=orderStatus`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    assert.equal(response.status, 200, `${status}: ${await response.text()}`);
  }
  assert.equal((await firestore.doc(`beautyOrders/${createdOrderId}`).get()).data()?.orderStatus, "completed");
});
