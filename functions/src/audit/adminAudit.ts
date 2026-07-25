import type {
  ActiveAdminIdentity
} from "../security/adminAuthorization";

import {
  FieldValue
} from "firebase-admin/firestore";

export interface AdminAuditLogDraft {
  adminUid: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  createdAt: FieldValue;
}

export function createAdminAuditLogDraft(
  admin: ActiveAdminIdentity,
  input: {
    action: string;
    targetType: string;
    targetId: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  }
): AdminAuditLogDraft {
  return {
    adminUid: admin.uid,
    adminEmail: admin.email,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    before: input.before ?? {},
    after: input.after ?? {},
    createdAt:
      FieldValue.serverTimestamp()
  };
}
