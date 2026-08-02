import type { UserRecord } from "firebase-admin/auth";
import { createPhoneIdentity } from "../domain/phoneIdentity";

export interface SlotMemberIdentity {
  uid: string;
  phoneIdentity: string;
  smsVerified: true;
}

export function authorizeSlotMember(input: {
  authUser: UserRecord;
  userData: FirebaseFirestore.DocumentData | undefined;
  hmacSecret: string;
}): SlotMemberIdentity {
  if (input.authUser.disabled || !input.authUser.emailVerified ||
      input.userData?.role !== "user" || input.userData.status !== "active" ||
      input.userData.phoneVerified !== true || !input.authUser.phoneNumber) {
    throw new Error("slot-member-ineligible");
  }
  return {
    uid: input.authUser.uid,
    phoneIdentity: createPhoneIdentity(input.authUser.phoneNumber, input.hmacSecret),
    smsVerified: true,
  };
}
