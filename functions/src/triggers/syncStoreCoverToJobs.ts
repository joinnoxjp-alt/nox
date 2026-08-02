import { createHash } from "node:crypto";

import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { info as logInfo } from "firebase-functions/logger";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";

import {
  FUNCTIONS_RUNTIME_SERVICE_ACCOUNT,
  REGION,
} from "../config";
import {
  cachedStoreCoverUrl,
  jobNeedsStoreCoverUpdate,
  STORE_COVER_SYNC_PAGE_SIZE,
  storeCoverChanged,
} from "../domain/storeCoverCache";
import { firestore } from "../firebaseAdmin";

interface SyncPageResult {
  matched: number;
  updated: number;
  lastId: string;
  superseded: boolean;
}

function eventHash(eventId: string): string {
  return createHash("sha256").update(eventId).digest("hex").slice(0, 40);
}

async function syncStoreCover(
  storeId: string,
  coverImageUrl: string,
  auditId: string,
): Promise<void> {
  const auditReference = firestore.doc(`adminAuditLogs/${auditId}`);
  const existingAudit = await auditReference.get();
  const existingAuditData = existingAudit.data() ?? {};
  if (existingAuditData.status === "completed") return;

  let cursor = typeof existingAuditData.lastProcessedJobId === "string"
    ? existingAuditData.lastProcessedJobId
    : "";
  let matched = typeof existingAuditData.matchedJobCount === "number"
    ? existingAuditData.matchedJobCount
    : 0;
  let updated = typeof existingAuditData.updatedJobCount === "number"
    ? existingAuditData.updatedJobCount
    : 0;
  let superseded = false;

  do {
    const page = await firestore.runTransaction<SyncPageResult>(async (transaction) => {
      const storeSnapshot = await transaction.get(firestore.doc(`stores/${storeId}`));
      const currentCover = storeSnapshot.exists
        ? cachedStoreCoverUrl(storeSnapshot.data()?.coverImageUrl)
        : "";
      if (currentCover !== coverImageUrl) {
        return { matched: 0, updated: 0, lastId: "", superseded: true };
      }

      let jobsQuery = firestore
        .collection("jobs")
        .where("storeId", "==", storeId)
        .orderBy(FieldPath.documentId())
        .limit(STORE_COVER_SYNC_PAGE_SIZE);
      if (cursor) jobsQuery = jobsQuery.startAfter(cursor);

      const jobsSnapshot = await transaction.get(jobsQuery);
      let updatedInPage = 0;
      for (const jobSnapshot of jobsSnapshot.docs) {
        if (jobNeedsStoreCoverUpdate(jobSnapshot.data(), coverImageUrl)) {
          transaction.update(jobSnapshot.ref, { storeCoverImageUrl: coverImageUrl });
          updatedInPage += 1;
        }
      }
      return {
        matched: jobsSnapshot.size,
        updated: updatedInPage,
        lastId: jobsSnapshot.docs.at(-1)?.id ?? "",
        superseded: false,
      };
    });

    matched += page.matched;
    updated += page.updated;
    superseded = page.superseded;
    cursor = page.lastId;
    if (!superseded && cursor) {
      await auditReference.set({
        actionType: "sync_store_cover_to_jobs",
        targetType: "store",
        targetId: storeId,
        status: "processing",
        lastProcessedJobId: cursor,
        matchedJobCount: matched,
        updatedJobCount: updated,
        coverPresent: Boolean(coverImageUrl),
        progressUpdatedAt: FieldValue.serverTimestamp(),
        actorType: "system_trigger",
      }, { merge: true });
    }
    if (superseded || page.matched < STORE_COVER_SYNC_PAGE_SIZE) break;
  } while (cursor);

  await auditReference.set({
    actionType: "sync_store_cover_to_jobs",
    targetType: "store",
    targetId: storeId,
    status: superseded ? "superseded" : "completed",
    matchedJobCount: matched,
    updatedJobCount: updated,
    coverPresent: Boolean(coverImageUrl),
    completedAt: FieldValue.serverTimestamp(),
    actorType: "system_trigger",
  });
  logInfo("Store cover cache synchronization finished.", {
    auditId,
    matchedJobCount: matched,
    updatedJobCount: updated,
    status: superseded ? "superseded" : "completed",
  });
}

export const syncStoreCoverToJobs = onDocumentUpdated(
  {
    document: "stores/{storeId}",
    region: REGION,
    serviceAccount: FUNCTIONS_RUNTIME_SERVICE_ACCOUNT,
    memory: "256MiB",
    timeoutSeconds: 120,
    maxInstances: 2,
    concurrency: 1,
    retry: true,
  },
  async (event) => {
    const before = event.data?.before.data() ?? {};
    const after = event.data?.after.data() ?? {};
    if (!storeCoverChanged(before, after)) return;

    const storeId = event.params.storeId;
    const coverImageUrl = cachedStoreCoverUrl(after.coverImageUrl);
    await syncStoreCover(
      storeId,
      coverImageUrl,
      `store_cover_sync_${eventHash(event.id)}`,
    );
  },
);
