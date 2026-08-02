import { safePublicStorageImageUrl } from "./publicJobStoreMedia";

export const STORE_COVER_SYNC_PAGE_SIZE = 400;

export function cachedStoreCoverUrl(value: unknown): string {
  return safePublicStorageImageUrl(value);
}

export function storeCoverChanged(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): boolean {
  return cachedStoreCoverUrl(before.coverImageUrl) !==
    cachedStoreCoverUrl(after.coverImageUrl);
}

export function jobNeedsStoreCoverUpdate(
  job: Record<string, unknown>,
  coverImageUrl: string,
): boolean {
  return job.storeCoverImageUrl !== coverImageUrl;
}
