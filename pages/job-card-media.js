(function initializeJobCardMedia(globalObject) {
  function firstUrl(values) {
    if (!Array.isArray(values)) return "";
    const value = values.find(
      (item) => typeof item === "string" && item.trim(),
    );
    return value ? value.trim() : "";
  }

  function select(job, placeholderUrl) {
    return (
      firstUrl(job.imageUrls) ||
      [job.mainImage, job.imageUrl, job.image]
        .find((value) => typeof value === "string" && value.trim())?.trim() ||
      firstUrl(job.images) ||
      (typeof job.storeCoverImageUrl === "string"
        ? job.storeCoverImageUrl.trim()
        : "") ||
      placeholderUrl
    );
  }

  const api = { select };
  globalObject.NoxJobCardMedia = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
