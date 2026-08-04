(function initializeAdminStoreMedia(globalObject) {
  const MEDIA_CONFIG = Object.freeze({
    logo: Object.freeze({ label: "店舗ロゴ", maxBytes: 2 * 1024 * 1024 }),
    cover: Object.freeze({ label: "プロフィール画像", maxBytes: 5 * 1024 * 1024 }),
    profile: Object.freeze({ label: "プロフィール画像", maxBytes: 2 * 1024 * 1024 }),
    gallery: Object.freeze({ label: "店舗画像", maxBytes: 5 * 1024 * 1024 }),
  });
  const ADMIN_VISIBLE_MEDIA_KINDS = Object.freeze(["cover", "gallery"]);
  const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

  function validateFile(file, kind) {
    const config = MEDIA_CONFIG[kind];
    if (!config) throw new Error("画像種別が正しくありません。");
    if (!file || !ALLOWED_TYPES.has(file.type)) {
      throw new Error("JPEG・PNG・WebP画像を選択してください。");
    }
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > config.maxBytes) {
      throw new Error(`${config.label}は${config.maxBytes / 1024 / 1024}MB以下にしてください。`);
    }
  }

  function buildUploadRequest({ storeId, kind, slot, file, imageBase64 }) {
    validateFile(file, kind);
    const request = {
      operation: "upload", storeId, kind,
      fileName: file.name, contentType: file.type, imageBase64,
    };
    if (kind === "gallery") {
      if (!Number.isInteger(slot) || slot < 0 || slot > 9) {
        throw new Error("ギャラリーslotが正しくありません。");
      }
      request.slot = slot;
    }
    return request;
  }

  function buildDeleteRequest({ storeId, kind, slot }) {
    if (!MEDIA_CONFIG[kind]) throw new Error("画像種別が正しくありません。");
    const request = { operation: "delete", storeId, kind };
    if (kind === "gallery") {
      if (!Number.isInteger(slot) || slot < 0 || slot > 9) {
        throw new Error("ギャラリーslotが正しくありません。");
      }
      request.slot = slot;
    }
    return request;
  }

  const api = {
    MEDIA_CONFIG, ADMIN_VISIBLE_MEDIA_KINDS,
    validateFile, buildUploadRequest, buildDeleteRequest,
  };
  globalObject.NoxAdminStoreMedia = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
