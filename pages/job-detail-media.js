(function initializeJobDetailMedia(globalObject) {
  function uniqueUrls(values) {
    return [...new Set(values.filter((value) => typeof value === "string" && value))];
  }

  function jobImages(data) {
    if (Array.isArray(data.imageUrls)) return uniqueUrls(data.imageUrls);
    if (Array.isArray(data.images)) return uniqueUrls(data.images);
    return uniqueUrls([data.imageUrl]);
  }

  function compose(data, storeMedia, placeholderUrl = "") {
    const ownImages = jobImages(data);
    const galleryImages = Array.isArray(storeMedia.galleryImages)
      ? storeMedia.galleryImages
      : [];
    return {
      heroUrl: ownImages[0] || storeMedia.coverImageUrl || placeholderUrl,
      galleryUrls: uniqueUrls(galleryImages),
    };
  }

  const api = { jobImages, compose };
  globalObject.NoxJobDetailMedia = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
