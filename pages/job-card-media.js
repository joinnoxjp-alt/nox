(function initializeJobCardMedia(globalObject) {
  function firstUrl(values) {
    if (!Array.isArray(values)) return "";
    const value = values.find(
      (item) => typeof item === "string" && item.trim(),
    );
    return value ? value.trim() : "";
  }

  function select(job, placeholderUrl) {
    const storeFallback = job.listingSource === "public_info"
      ? ""
      : (typeof job.storeCoverImageUrl === "string"
          ? job.storeCoverImageUrl.trim()
          : "");
    return (
      [job.mainImage, job.imageUrl, job.image]
        .find((value) => typeof value === "string" && value.trim())?.trim() ||
      firstUrl(job.imageUrls) ||
      firstUrl(job.images) ||
      storeFallback ||
      placeholderUrl
    );
  }

  const api = { select };
  globalObject.NoxJobCardMedia = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
