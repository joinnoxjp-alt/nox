import { HttpsError, onCall } from "firebase-functions/v2/https";
import { authenticatedCallableOptions } from "../config";
import { firebaseAuth, firestore } from "../firebaseAdmin";
import { PHONE_IDENTITY_HMAC_SECRET } from "../security/phoneIdentitySecret";
import { authorizeSlotMember } from "../security/slotMemberAuthorization";
import { authorizeOperatorTestPlay } from "../domain/operatorTestPlay";
import { assertCoinRequestId } from "../domain/coin";
import { assertMemberSlotInput, selectSlotOutcome } from "../domain/slotEngine";
import { playMemberSlotTransaction, recordOperatorSlotPlay } from "../domain/slotTransactions";

const OPTIONS = {
  ...authenticatedCallableOptions,
  secrets: [PHONE_IDENTITY_HMAC_SECRET],
  memory: "256MiB" as const,
  timeoutSeconds: 30,
  maxInstances: 10,
};

function operatorInput(value: unknown): { requestId: string; probabilityProfile: unknown } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid-slot-input");
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) =>
    key !== "requestId" && key !== "probabilityProfile")) {
    throw new Error("unknown-slot-input");
  }
  return {
    requestId: assertCoinRequestId(input.requestId),
    probabilityProfile: input.probabilityProfile,
  };
}

export const playNoxChanceSlot = onCall(OPTIONS, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
  try {
    const userSnapshot = await firestore.doc(`users/${request.auth.uid}`).get();
    const userData = userSnapshot.data();
    if (userData?.role === "admin") {
      const input = operatorInput(request.data);
      const context = await authorizeOperatorTestPlay(request.auth, {
        probabilityProfile: input.probabilityProfile,
      });
      const profile = context.probabilityProfile === "standard"
        ? "operator_standard" as const
        : "operator_high_probability_preview" as const;
      return await recordOperatorSlotPlay({
        context, requestId: input.requestId, outcome: selectSlotOutcome(profile),
      });
    }
    const input = assertMemberSlotInput(request.data);
    const authUser = await firebaseAuth.getUser(request.auth.uid);
    const member = authorizeSlotMember({
      authUser, userData, hmacSecret: PHONE_IDENTITY_HMAC_SECRET.value(),
    });
    // The transaction chooses trial/standard from protected lifetime usage.
    // Draw both once so retries never reroll; only the selected outcome is persisted.
    const trialOutcome = selectSlotOutcome("trial");
    const standardOutcome = selectSlotOutcome("standard");
    return await playMemberSlotTransaction({
      uid: member.uid, phoneIdentity: member.phoneIdentity,
      requestId: input.requestId,
      outcomes: { trial: trialOutcome, standard: standardOutcome },
    }, { });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (message === "insufficient-coin-balance" || message === "coin-wallet-frozen") {
      throw new HttpsError("failed-precondition", "NOX CHANCEを現在利用できません。");
    }
    if (message.includes("input") || message.includes("request-id")) {
      throw new HttpsError("invalid-argument", "入力内容が正しくありません。");
    }
    throw new HttpsError("permission-denied", "NOX CHANCEを現在利用できません。");
  }
});
