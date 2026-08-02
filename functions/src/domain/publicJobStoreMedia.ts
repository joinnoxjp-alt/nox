export interface PublicStoreMediaOutput {
  logoUrl: string;
  coverImageUrl: string;
  profileImageUrl: string;
  galleryImages: string[];
}

export interface PublicJobStoreMediaDependencies {
  getJob(jobId: string): Promise<Record<string, unknown> | null>;
  getStore(storeId: string): Promise<Record<string, unknown> | null>;
  getGallery(storeId: string): Promise<Array<{ slot: string; url: unknown }>>;
}

export class PublicJobStoreMediaError extends Error {
  constructor(readonly code: "invalid-argument" | "not-found", message: string) {
    super(message);
  }
}

const EMPTY_MEDIA: PublicStoreMediaOutput = {
  logoUrl: "",
  coverImageUrl: "",
  profileImageUrl: "",
  galleryImages: [],
};
const PUBLIC_STORAGE_HOST = "firebasestorage.googleapis.com";
const PUBLIC_STORAGE_PATH_PREFIX = "/v0/b/noxapp-29171.firebasestorage.app/o/";

function safeImageUrl(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 2048) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === PUBLIC_STORAGE_HOST &&
      url.pathname.startsWith(PUBLIC_STORAGE_PATH_PREFIX)
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

export async function loadPublicJobStoreMedia(
  jobId: string,
  dependencies: PublicJobStoreMediaDependencies,
): Promise<PublicStoreMediaOutput> {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(jobId)) {
    throw new PublicJobStoreMediaError("invalid-argument", "The job ID is invalid.");
  }
  const job = await dependencies.getJob(jobId);
  if (!job || job.status !== "approved" || job.isPublic !== true || job.contractListingStatus !== "active") {
    throw new PublicJobStoreMediaError("not-found", "The job is unavailable.");
  }
  const storeId = typeof job.storeId === "string" && job.storeId
    ? job.storeId
    : typeof job.ownerId === "string" ? job.ownerId : "";
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(storeId)) return { ...EMPTY_MEDIA };

  const store = await dependencies.getStore(storeId);
  if (!store) return { ...EMPTY_MEDIA };
  const gallery = await dependencies.getGallery(storeId);
  const galleryImages = gallery
    .filter((item) => /^[0-9]$/.test(item.slot))
    .sort((a, b) => Number(a.slot) - Number(b.slot))
    .map((item) => safeImageUrl(item.url))
    .filter(Boolean)
    .slice(0, 10);

  return {
    logoUrl: safeImageUrl(store.logoUrl),
    coverImageUrl: safeImageUrl(store.coverImageUrl),
    profileImageUrl: safeImageUrl(store.profileImageUrl),
    galleryImages,
  };
}
