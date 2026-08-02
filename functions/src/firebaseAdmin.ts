import {
  getApps,
  initializeApp
} from "firebase-admin/app";

import {
  getFirestore
} from "firebase-admin/firestore";

import {
  getAuth
} from "firebase-admin/auth";

import {
  getStorage
} from "firebase-admin/storage";

const app =
  getApps()[0] ??
  initializeApp();

export const firestore =
  getFirestore(app);

export const firebaseAuth =
  getAuth(app);

export function getStorageBucket() {
  return getStorage(app).bucket();
}
