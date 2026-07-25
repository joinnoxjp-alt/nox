import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const FIXED_ADMIN_UID = "MkIUfZ4JFEhRTUzEKPPNxKo0gut1";
export const FIXED_ADMIN_EMAIL = "watabaseball00@gmail.com";

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isFixedActiveAdmin(user, userData) {
  return Boolean(
    user &&
      user.uid === FIXED_ADMIN_UID &&
      normalizeEmail(user.email) === FIXED_ADMIN_EMAIL &&
      user.emailVerified === true &&
      userData?.role === "admin" &&
      userData?.status === "active"
  );
}

export async function getAccountAccess(db, user) {
  if (!user) {
    return { kind: "signed-out", userData: null };
  }

  const userSnapshot = await getDoc(doc(db, "users", user.uid));
  if (!userSnapshot.exists()) {
    return { kind: "missing-user-document", userData: null };
  }

  const userData = userSnapshot.data();

  if (userData.status === "blocked") {
    return { kind: "blocked", userData };
  }

  if (userData.status === "pending") {
    return { kind: "pending", userData };
  }

  if (isFixedActiveAdmin(user, userData)) {
    return { kind: "admin", userData };
  }

  if (userData.role === "store" && userData.status === "active") {
    return { kind: "store", userData };
  }

  if (userData.role === "user" && userData.status === "active") {
    return { kind: "user", userData };
  }

  return { kind: "invalid", userData };
}

export function getPostLoginPath(accessKind) {
  if (accessKind === "store") {
    return "./store-dashboard.html";
  }

  if (accessKind === "admin" || accessKind === "user") {
    return "./mypage.html";
  }

  return null;
}
