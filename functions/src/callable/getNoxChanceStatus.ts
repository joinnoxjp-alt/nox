import { HttpsError, onCall } from "firebase-functions/v2/https";
import { authenticatedCallableOptions } from "../config";
import { assertStatusInput } from "../domain/slotEngine";
import { getMemberSlotStatus } from "../domain/slotTransactions";
import { firebaseAuth, firestore } from "../firebaseAdmin";
import { PHONE_IDENTITY_HMAC_SECRET } from "../security/phoneIdentitySecret";
import { authorizeSlotMember } from "../security/slotMemberAuthorization";
import { assertActiveAdmin } from "../security/adminAuthorization";

export const getNoxChanceStatus = onCall({
  ...authenticatedCallableOptions,
  secrets: [PHONE_IDENTITY_HMAC_SECRET],
  memory: "256MiB",
  timeoutSeconds: 30,
  maxInstances: 10,
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
  try {
    assertStatusInput(request.data);
    const [authUser, userSnapshot] = await Promise.all([
      firebaseAuth.getUser(request.auth.uid),
      firestore.doc(`users/${request.auth.uid}`).get(),
    ]);
    if (userSnapshot.data()?.role === "admin") {
      await assertActiveAdmin(request.auth);
      return {
        freePlaysRemaining: 0,
        availableCoinBalance: 0,
        medalBalance: 0,
        accountFrozen: false,
        smsVerified: true,
        nextPlayKind: "operator_test" as const,
        isOperatorTestAvailable: true,
      };
    }
    const member = authorizeSlotMember({
      authUser, userData: userSnapshot.data(),
      hmacSecret: PHONE_IDENTITY_HMAC_SECRET.value(),
    });
    return await getMemberSlotStatus(member);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (message.includes("input")) {
      throw new HttpsError("invalid-argument", "入力内容が正しくありません。");
    }
    throw new HttpsError("permission-denied", "NOX CHANCEを現在利用できません。");
  }
});
