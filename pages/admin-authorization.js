import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const FIXED_ADMIN_UID =
  "MkIUfZ4JFEhRTUzEKPPNxKo0gut1";

export const FIXED_ADMIN_EMAIL =
  "watabaseball00@gmail.com";

function normalizedEmail(value) {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
}

export function waitForAuthUser(auth) {
  return new Promise((resolve) => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        (user) => {
          unsubscribe();
          resolve(user);
        }
      );
  });
}

export async function requireActiveAdmin({
  auth,
  db,
  loginUrl
}) {
  const user =
    await waitForAuthUser(auth);

  if (!user) {
    location.replace(loginUrl);
    return null;
  }

  const identityMatches =
    user.uid === FIXED_ADMIN_UID &&
    normalizedEmail(user.email) ===
      FIXED_ADMIN_EMAIL &&
    user.emailVerified === true;

  if (!identityMatches) {
    location.replace(loginUrl);
    return null;
  }

  try {
    const snapshot =
      await getDoc(
        doc(db, "users", user.uid)
      );
    const data =
      snapshot.exists()
        ? snapshot.data()
        : null;

    if (
      data?.role !== "admin" ||
      data.status !== "active"
    ) {
      location.replace(loginUrl);
      return null;
    }

    return user;
  } catch {
    location.replace(loginUrl);
    return null;
  }
}
