import { randomUUID } from "node:crypto";
import { inflateSync } from "node:zlib";

export type StoreMediaKind = "logo" | "cover" | "profile" | "gallery";
export type StoreMediaOperation = "upload" | "delete";

export interface StoreMediaRecord {
  url: string;
  storagePath: string;
}

export interface StoreMediaAdmin {
  uid: string;
  email: string;
}

export interface StoreMediaInput {
  operation: StoreMediaOperation;
  storeId: string;
  kind: StoreMediaKind;
  slot?: number;
  fileName?: string;
  contentType?: string;
  imageBase64?: string;
}

export interface StoreMediaDependencies {
  getStore(storeId: string): Promise<Record<string, unknown> | null>;
  getGalleryImage(storeId: string, slot: number): Promise<StoreMediaRecord | null>;
  saveImage(input: {
    path: string;
    bytes: Buffer;
    contentType: string;
    metadata: Record<string, string>;
  }): Promise<string>;
  deleteImage(path: string): Promise<void>;
  writeMedia(input: {
    storeId: string;
    kind: StoreMediaKind;
    slot?: number;
    media: StoreMediaRecord;
    previous: StoreMediaRecord | null;
    admin: StoreMediaAdmin;
    action: "uploaded" | "replaced";
  }): Promise<void>;
  clearMedia(input: {
    storeId: string;
    kind: StoreMediaKind;
    slot?: number;
    previous: StoreMediaRecord;
    admin: StoreMediaAdmin;
  }): Promise<void>;
  restoreMedia(input: {
    storeId: string;
    kind: StoreMediaKind;
    slot?: number;
    previous: StoreMediaRecord;
    admin: StoreMediaAdmin;
  }): Promise<boolean>;
  makeId?: () => string;
}

export class StoreMediaError extends Error {
  constructor(
    readonly code: "invalid-argument" | "not-found" | "failed-precondition" | "internal",
    message: string,
  ) {
    super(message);
  }
}

const IMAGE_CONFIG = {
  logo: { directory: "logo", maxBytes: 2 * 1024 * 1024 },
  cover: { directory: "cover", maxBytes: 5 * 1024 * 1024 },
  profile: { directory: "profile", maxBytes: 2 * 1024 * 1024 },
  gallery: { directory: "gallery", maxBytes: 5 * 1024 * 1024 },
} as const;

const EXTENSIONS: Record<string, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};
const MAX_IMAGE_PIXELS = 40_000_000;

function invalid(message: string): never {
  throw new StoreMediaError("invalid-argument", message);
}

function validateIdentity(input: StoreMediaInput): void {
  if (input.operation !== "upload" && input.operation !== "delete") {
    invalid("操作内容が正しくありません。");
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.storeId)) {
    invalid("店舗IDが正しくありません。");
  }
  if (!(input.kind in IMAGE_CONFIG)) invalid("画像種別が正しくありません。");
  if (input.kind === "gallery") {
    if (!Number.isInteger(input.slot) || Number(input.slot) < 0 || Number(input.slot) > 9) {
      invalid("ギャラリーslotは0〜9で指定してください。");
    }
  } else if (input.slot !== undefined) {
    invalid("この画像種別にslotは指定できません。");
  }
}

function isJpeg(bytes: Buffer): boolean {
  if (bytes.length < 11 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return false;
  for (let offset = 2; offset + 8 < bytes.length;) {
    if (bytes[offset] !== 0xff) return false;
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) return false;
    if ((marker >= 0xc0 && marker <= 0xc3) && length >= 7) {
      const height = bytes.readUInt16BE(offset + 5);
      const width = bytes.readUInt16BE(offset + 7);
      return width > 0 && height > 0 && width * height <= MAX_IMAGE_PIXELS;
    }
    offset += 2 + length;
  }
  return false;
}

function isPng(bytes: Buffer): boolean {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(signature)) return false;
  let offset = 8;
  let width = 0;
  let height = 0;
  const imageData: Buffer[] = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) return false;
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "IHDR") {
      if (offset !== 8 || length !== 13) return false;
      width = bytes.readUInt32BE(offset + 8);
      height = bytes.readUInt32BE(offset + 12);
      if (!width || !height || width * height > MAX_IMAGE_PIXELS) return false;
    } else if (type === "IDAT") {
      imageData.push(bytes.subarray(offset + 8, offset + 8 + length));
    } else if (type === "IEND") {
      if (length !== 0 || end !== bytes.length || !width || !imageData.length) return false;
      try {
        return inflateSync(Buffer.concat(imageData), { maxOutputLength: 64 * 1024 * 1024 }).length > 0;
      } catch {
        return false;
      }
    }
    offset = end;
  }
  return false;
}

function isWebp(bytes: Buffer): boolean {
  if (bytes.length < 30 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") return false;
  if (bytes.readUInt32LE(4) + 8 !== bytes.length) return false;
  return ["VP8 ", "VP8L", "VP8X"].includes(bytes.toString("ascii", 12, 16));
}

function detectImageType(bytes: Buffer): string | null {
  if (isJpeg(bytes)) {
    return "image/jpeg";
  }
  if (isPng(bytes)) {
    return "image/png";
  }
  if (isWebp(bytes)) {
    return "image/webp";
  }
  return null;
}

function decodeImage(input: StoreMediaInput): { bytes: Buffer; contentType: string; extension: string } {
  if (typeof input.contentType !== "string" || !EXTENSIONS[input.contentType]) {
    invalid("JPEG・PNG・WebPのみアップロードできます。");
  }
  if (typeof input.fileName !== "string" || input.fileName.length > 255 || /[\\/\u0000-\u001f]/.test(input.fileName)) {
    invalid("ファイル名が正しくありません。");
  }
  const extension = input.fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (!EXTENSIONS[input.contentType].includes(extension)) {
    invalid("拡張子と画像形式が一致しません。");
  }
  if (typeof input.imageBase64 !== "string" || !input.imageBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.imageBase64)) {
    invalid("画像データが正しいBase64ではありません。");
  }
  if (input.imageBase64.length > Math.ceil(IMAGE_CONFIG[input.kind].maxBytes / 3) * 4 + 4) {
    invalid(`画像サイズは${IMAGE_CONFIG[input.kind].maxBytes / 1024 / 1024}MB以下にしてください。`);
  }
  const bytes = Buffer.from(input.imageBase64, "base64");
  if (!bytes.length || bytes.toString("base64").replace(/=+$/, "") !== input.imageBase64.replace(/=+$/, "")) {
    invalid("画像データが正しいBase64ではありません。");
  }
  if (bytes.length > IMAGE_CONFIG[input.kind].maxBytes) {
    invalid(`画像サイズは${IMAGE_CONFIG[input.kind].maxBytes / 1024 / 1024}MB以下にしてください。`);
  }
  if (detectImageType(bytes) !== input.contentType) {
    invalid("画像データの実体と申告された形式が一致しません。");
  }
  return { bytes, contentType: input.contentType, extension };
}

function existingSingle(store: Record<string, unknown>, kind: Exclude<StoreMediaKind, "gallery">): StoreMediaRecord | null {
  const fields = {
    logo: ["logoUrl", "logoStoragePath"],
    cover: ["coverImageUrl", "coverImageStoragePath"],
    profile: ["profileImageUrl", "profileImageStoragePath"],
  } as const;
  const [urlField, pathField] = fields[kind];
  return typeof store[pathField] === "string" && store[pathField]
    ? { url: typeof store[urlField] === "string" ? store[urlField] : "", storagePath: store[pathField] }
    : null;
}

function ownedPath(path: string, storeId: string, kind: StoreMediaKind, slot?: number): boolean {
  const slotPart = kind === "gallery" ? `${slot}/` : "";
  return path.startsWith(`stores/${storeId}/${IMAGE_CONFIG[kind].directory}/${slotPart}`) && !path.includes("..");
}

export async function executeAdminStoreMedia(
  input: StoreMediaInput,
  admin: StoreMediaAdmin,
  dependencies: StoreMediaDependencies,
): Promise<{ success: true; operation: StoreMediaOperation; storeId: string; kind: StoreMediaKind; slot?: number; url?: string; storagePath?: string; replaced?: boolean; oldStorageCleanupPending?: boolean }> {
  validateIdentity(input);
  const store = await dependencies.getStore(input.storeId);
  if (!store) throw new StoreMediaError("not-found", "対象の店舗が見つかりません。");
  const previous = input.kind === "gallery"
    ? await dependencies.getGalleryImage(input.storeId, input.slot as number)
    : existingSingle(store, input.kind);

  if (input.operation === "upload") {
    const image = decodeImage(input);
    const id = (dependencies.makeId ?? randomUUID)();
    const slotPart = input.kind === "gallery" ? `${input.slot}/` : "";
    const path = `stores/${input.storeId}/${IMAGE_CONFIG[input.kind].directory}/${slotPart}${id}`;
    let url = "";
    try {
      url = await dependencies.saveImage({
        path,
        bytes: image.bytes,
        contentType: image.contentType,
        metadata: { ownerId: input.storeId, mediaKind: input.kind },
      });
      await dependencies.writeMedia({
        storeId: input.storeId, kind: input.kind, slot: input.slot,
        media: { url, storagePath: path }, previous, admin,
        action: previous ? "replaced" : "uploaded",
      });
    } catch (error) {
      if (url) await dependencies.deleteImage(path).catch(() => undefined);
      throw error;
    }
    let oldStorageCleanupPending = false;
    if (previous && ownedPath(previous.storagePath, input.storeId, input.kind, input.slot)) {
      try {
        await dependencies.deleteImage(previous.storagePath);
      } catch {
        oldStorageCleanupPending = true;
      }
    }
    return { success: true, operation: input.operation, storeId: input.storeId, kind: input.kind, slot: input.slot, url, storagePath: path, replaced: Boolean(previous), oldStorageCleanupPending };
  }

  if (input.operation !== "delete") invalid("操作内容が正しくありません。");
  if (!previous) throw new StoreMediaError("not-found", "削除対象の画像が見つかりません。");
  await dependencies.clearMedia({ storeId: input.storeId, kind: input.kind, slot: input.slot, previous, admin });
  if (ownedPath(previous.storagePath, input.storeId, input.kind, input.slot)) {
    try {
      await dependencies.deleteImage(previous.storagePath);
    } catch (error) {
      try {
        const restored = await dependencies.restoreMedia({ storeId: input.storeId, kind: input.kind, slot: input.slot, previous, admin });
        if (!restored) {
          throw new StoreMediaError("failed-precondition", "Storageの削除には失敗しましたが、同時に保存された新しい画像は維持しました。");
        }
      } catch {
        throw new StoreMediaError("failed-precondition", "Storageの削除に失敗しました。Firestoreは新しい状態を上書きしていません。");
      }
      throw new StoreMediaError("failed-precondition", "画像削除に失敗したためFirestoreを復元しました。");
    }
  }
  return { success: true, operation: input.operation, storeId: input.storeId, kind: input.kind, slot: input.slot };
}

export async function executeAuthorizedAdminStoreMedia<Auth>(
  input: StoreMediaInput,
  auth: Auth,
  authorize: (auth: Auth) => Promise<StoreMediaAdmin>,
  dependencies: StoreMediaDependencies,
) {
  const admin = await authorize(auth);
  return executeAdminStoreMedia(input, admin, dependencies);
}
