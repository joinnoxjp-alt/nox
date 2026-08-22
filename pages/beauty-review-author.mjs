const ageLabels = Object.freeze({ "10s": "10代", "20s": "20代", "30s": "30代", "40s": "40代", "50s": "50代", "60plus": "60代以上" });

export function formatReviewAuthor(review = {}) {
  const name = String(review.authorName || "").trim();
  const initials = String(review.authorInitials || "").trim();
  const age = ageLabels[String(review.ageGroup || "")] || "";
  if (!Object.prototype.hasOwnProperty.call(review, "authorDisplayMode") || !review.authorDisplayMode) return name;
  switch (review.authorDisplayMode) {
    case "name": return name;
    case "initials": return initials || "匿名";
    case "anonymous": return "匿名";
    case "age": return age;
    case "initials_age": return [initials || "匿名", age].filter(Boolean).join(" / ");
    case "anonymous_age": return ["匿名", age].filter(Boolean).join(" / ");
    default: return "匿名";
  }
}
