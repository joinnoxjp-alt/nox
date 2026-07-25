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

const app =
  getApps()[0] ??
  initializeApp();

export const firestore =
  getFirestore(app);

export const firebaseAuth =
  getAuth(app);
