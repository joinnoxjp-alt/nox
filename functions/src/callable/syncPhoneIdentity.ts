import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { authenticatedCallableOptions } from "../config";
import {
  assertPhoneIdentityAvailable,
  assertEligiblePhoneIdentityUser,
  assertEmptyPhoneIdentityInput,
  createPhoneIdentity,
  maskPhoneNumber,
  PHONE_IDENTITY_VERSION,
} from "../domain/phoneIdentity";
import { firebaseAuth, firestore } from "../firebaseAdmin";
import { PHONE_IDENTITY_HMAC_SECRET } from "../security/phoneIdentitySecret";

export const syncPhoneIdentity = onCall(
  {
    ...authenticatedCallableOptions,
    secrets: [PHONE_IDENTITY_HMAC_SECRET],
    timeoutSeconds: 30,
    memory: "256MiB",
    maxInstances: 10,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "ログインが必要です。");
    }
    try {
      assertEmptyPhoneIdentityInput(request.data);
    } catch {
      throw new HttpsError("invalid-argument", "入力項目が正しくありません。");
    }

    const uid = request.auth.uid;
    const authUser = await firebaseAuth.getUser(uid);
    if (!authUser.emailVerified) {
      throw new HttpsError(
        "permission-denied",
        "メールアドレス認証を完了してください。",
      );
    }
    const phoneNumber = authUser.phoneNumber;
    if (!phoneNumber) {
      throw new HttpsError(
        "failed-precondition",
        "Firebase AuthenticationでSMS認証を完了してください。",
      );
    }

    let phoneIdentity: string;
    let maskedPhoneNumber: string;
    try {
      phoneIdentity = createPhoneIdentity(
        phoneNumber,
        PHONE_IDENTITY_HMAC_SECRET.value(),
      );
      maskedPhoneNumber = maskPhoneNumber(phoneNumber);
    } catch {
      throw new HttpsError("internal", "電話番号の認証情報を処理できませんでした。");
    }

    const identityRef = firestore.doc(`phoneIdentities/${phoneIdentity}`);
    const playerRef = firestore.doc(`slotPlayerStates/${phoneIdentity}`);
    const userRef = firestore.doc(`users/${uid}`);

    try {
      await firestore.runTransaction(async (transaction) => {
        const [identitySnapshot, playerSnapshot, userSnapshot] =
          await Promise.all([
            transaction.get(identityRef),
            transaction.get(playerRef),
            transaction.get(userRef),
          ]);
        if (!userSnapshot.exists) {
          throw new HttpsError("failed-precondition", "会員情報が見つかりません。");
        }
        const userData = userSnapshot.data() ?? {};
        try {
          assertEligiblePhoneIdentityUser(
            authUser.emailVerified,
            userData.role,
            userData.status,
          );
        } catch {
          throw new HttpsError(
            "permission-denied",
            "この会員アカウントではSMS認証を利用できません。",
          );
        }
        assertPhoneIdentityAvailable(
          identitySnapshot.data()?.uid,
          uid,
          identitySnapshot.data()?.status,
        );

        transaction.set(identityRef, {
          uid,
          version: PHONE_IDENTITY_VERSION,
          status: "active",
          createdAt: identitySnapshot.exists
            ? identitySnapshot.data()?.createdAt ?? FieldValue.serverTimestamp()
            : FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        if (!playerSnapshot.exists) {
          transaction.create(playerRef, {
            uid,
            phoneIdentityVersion: PHONE_IDENTITY_VERSION,
            freePlayLimit: 10,
            freePlaysConsumed: 0,
            paidPlaysConsumed: 0,
            medalBalance: 0,
            status: "active",
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        transaction.set(userRef, {
          phoneVerified: true,
          phoneVerifiedAt: FieldValue.serverTimestamp(),
          maskedPhoneNumber,
          phoneIdentityVersion: PHONE_IDENTITY_VERSION,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "phone-identity-already-used") {
        await firebaseAuth.updateUser(uid, { phoneNumber: null }).catch(() => undefined);
        throw new HttpsError(
          "already-exists",
          "この電話番号は別の会員アカウントで認証済みです。",
        );
      }
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "電話番号認証の保存に失敗しました。");
    }

    return {
      phoneVerified: true,
      maskedPhoneNumber,
      phoneIdentityVersion: PHONE_IDENTITY_VERSION,
    };
  },
);
