import { onRequest } from "firebase-functions/v2/https";
import { error as logError } from "firebase-functions/logger";
import type { Response } from "express";

import { FUNCTIONS_RUNTIME_SERVICE_ACCOUNT, REGION } from "../config";
import { composePublicCustomerPage, isCustomerPagePublic } from "../domain/storeCustomerPage";
import {
  fallbackMetadata, isPublicJob, isPublicWorkJob, isSafePublicId,
  jobMetadata, renderShareHtml, storeMetadata, workJobMetadata,
} from "../domain/shareOgp";
import { firestore } from "../firebaseAdmin";

const options = {
  region: REGION,
  serviceAccount: FUNCTIONS_RUNTIME_SERVICE_ACCOUNT,
  memory: "256MiB" as const,
  timeoutSeconds: 15,
  maxInstances: 10,
  concurrency: 40,
};

function requestId(value: unknown): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return isSafePublicId(candidate) ? candidate : "";
}

function shareUrl(functionName: string, id: string): string {
  const base = `https://${REGION}-noxapp-29171.cloudfunctions.net/${functionName}`;
  return id ? `${base}?id=${encodeURIComponent(id)}` : base;
}

function send(response: Response, metadata: ReturnType<typeof fallbackMetadata>): void {
  response.set("Content-Type", "text/html; charset=utf-8");
  response.set("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=60");
  response.set("X-Content-Type-Options", "nosniff");
  response.status(200).send(renderShareHtml(metadata));
}

export const shareJob = onRequest(options, async (request, response) => {
  const id = requestId(request.query.id);
  const url = shareUrl("shareJob", id);
  if (!id) return send(response, fallbackMetadata(url));
  try {
    const snapshot = await firestore.doc(`jobs/${id}`).get();
    const data = snapshot.data() as Record<string, unknown> | undefined;
    return send(response, snapshot.exists && data && isPublicJob(data) ? jobMetadata(id, data, url) : fallbackMetadata(url));
  } catch {
    logError("shareJob public lookup failed", { jobId: id });
    return send(response, fallbackMetadata(url));
  }
});

export const shareStore = onRequest(options, async (request, response) => {
  const id = requestId(request.query.id);
  const url = shareUrl("shareStore", id);
  if (!id) return send(response, fallbackMetadata(url));
  try {
    const [storeSnapshot, pageSnapshot] = await Promise.all([
      firestore.doc(`stores/${id}`).get(), firestore.doc(`storeCustomerPages/${id}`).get(),
    ]);
    const page = pageSnapshot.data() as Record<string, unknown> | undefined;
    if (!storeSnapshot.exists || !pageSnapshot.exists || !page || !isCustomerPagePublic(page)) return send(response, fallbackMetadata(url));
    const publicPage = composePublicCustomerPage(id, storeSnapshot.data() ?? {}, page, []);
    return send(response, storeMetadata(id, publicPage, url));
  } catch {
    logError("shareStore public lookup failed", { storeId: id });
    return send(response, fallbackMetadata(url));
  }
});

export const shareWorkJob = onRequest(options, async (request, response) => {
  const id = requestId(request.query.id);
  const url = shareUrl("shareWorkJob", id);
  if (!id) return send(response, fallbackMetadata(url, true));
  try {
    const snapshot = await firestore.doc(`workJobs/${id}`).get();
    const data = snapshot.data() as Record<string, unknown> | undefined;
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
    return send(response, snapshot.exists && data && isPublicWorkJob(data, today) ? workJobMetadata(id, data, url) : fallbackMetadata(url, true));
  } catch {
    logError("shareWorkJob public lookup failed", { jobId: id });
    return send(response, fallbackMetadata(url, true));
  }
});
