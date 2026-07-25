export type StoreInviteStatus =
  | "issued"
  | "redeemed"
  | "revoked";

export interface InviteTokenMaterial {
  token: string;
  tokenHash: string;
}

export interface StoreInviteIdentity {
  invitedEmailNormalized: string;
  ownerName: string;
  storeName: string;
}
