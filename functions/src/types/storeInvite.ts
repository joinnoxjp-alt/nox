export type StoreInviteStatus =
  | "issued"
  | "redeemed"
  | "revoked";

export type BusinessScope =
  | "night"
  | "general"
  | "both";

export interface InviteTokenMaterial {
  token: string;
  tokenHash: string;
}

export interface StoreInviteIdentity {
  invitedEmailNormalized: string;
  ownerName: string;
  storeName: string;
}

export interface GetStoreInvitePreviewInput {
  inviteToken: string;
}

export interface GetStoreInvitePreviewOutput {
  valid: true;
  storeName: string;
  emailHint: string;
  expiresAt: string;
  businessScope: BusinessScope;
}
