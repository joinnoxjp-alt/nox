import { getBrand, mediaMarkup } from "./beauty-data.js";

const brand = await getBrand();
const description = document.querySelector("[data-brand-description]");
if (description && brand.reasonMedia?.isVisible !== false && brand.reasonMedia?.url) {
  const frame = document.createElement("div");
  frame.className = "media-frame";
  frame.innerHTML = mediaMarkup(brand.reasonMedia, "NOXがMIRÈIOを取り扱う理由");
  description.after(frame);
}
