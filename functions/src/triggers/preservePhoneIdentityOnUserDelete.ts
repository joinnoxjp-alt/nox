import * as functions from "firebase-functions/v1";
import { FieldValue } from "firebase-admin/firestore";
import { FUNCTIONS_RUNTIME_SERVICE_ACCOUNT, REGION } from "../config";
import { firestore } from "../firebaseAdmin";
import { createDeletedAccountSafeguard } from "../domain/phoneIdentity";

export const preservePhoneIdentityOnUserDelete = functions
  .region(REGION)
  .runWith({
    serviceAccount: FUNCTIONS_RUNTIME_SERVICE_ACCOUNT,
    timeoutSeconds: 30,
    memory: "256MB",
  })
  .auth.user().onDelete(
    async (user) => {
      const identities = await firestore.collection("phoneIdentities")
        .where("uid", "==", user.uid)
        .limit(2)
        .get();

      for (const identity of identities.docs) {
        const playerRef = firestore.doc(`slotPlayerStates/${identity.id}`);
        const safeguardRef = firestore.doc(`deletedAccountSafeguards/${identity.id}`);
        await firestore.runTransaction(async (transaction) => {
          const [player, previousSafeguard] = await Promise.all([
            transaction.get(playerRef),
            transaction.get(safeguardRef),
          ]);
          const state = player.data() ?? {};
          const safeguard = createDeletedAccountSafeguard(
            state,
            previousSafeguard.data() ?? {},
          );
          transaction.set(safeguardRef, {
            phoneIdentityVersion: identity.data().version ?? 1,
            ...safeguard,
            deletedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          transaction.set(identity.ref, {
            uid: FieldValue.delete(),
            status: "deleted",
            deletedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          if (player.exists) {
            transaction.set(playerRef, {
              status: "deleted",
              updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
          }
        });
      }
    },
  );
