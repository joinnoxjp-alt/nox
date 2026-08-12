(function initializeJobDetailMedia(globalObject) {
  function uniqueUrls(values) {
    return [...new Set(values.filter((value) => typeof value === "string" && value))];
  }

  function jobImages(data) {
    return uniqueUrls([
      data.mainImage,
      data.imageUrl,
      data.image,
      ...(Array.isArray(data.imageUrls) ? data.imageUrls : []),
      ...(Array.isArray(data.images) ? data.images : []),
    ]);
  }

  function compose(data, storeMedia, placeholderUrl = "") {
    const ownImages = jobImages(data);
    const galleryImages = Array.isArray(storeMedia.galleryImages)
      ? storeMedia.galleryImages
      : [];
    return {
      heroUrl: ownImages[0] ||
        (data.listingSource === "public_info" ? "" : storeMedia.coverImageUrl) ||
        placeholderUrl,
      galleryUrls: uniqueUrls(galleryImages),
    };
  }

  const api = { jobImages, compose };
  globalObject.NoxJobDetailMedia = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
