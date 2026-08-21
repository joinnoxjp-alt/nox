import { getBrand, mediaMarkup } from "./beauty-data.js";

const esc = (value) => String(value ?? "").replace(
  /[&<>\"]/g,
  (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character])
);
const brand = await getBrand();
const extras = Array.isArray(brand.extraMedia)
  ? brand.extraMedia.filter((item) => item?.isVisible !== false && item?.url)
    .sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0))
  : [];
const defaultContainer = document.querySelector("[data-extra-media]");

if (brand.isPublic !== false && defaultContainer && extras.length) {
  let rendering = false;
  let observer;
  const renderPositions = () => {
    if (rendering) return;
    rendering = true;
    observer?.disconnect();
    document.querySelectorAll("[data-extra-positioned]").forEach((item) => item.remove());
    defaultContainer.innerHTML = "";
    for (const item of extras) {
      const figure = document.createElement("figure");
      figure.className = "media-frame";
      figure.dataset.extraPositioned = "";
      figure.innerHTML = `${mediaMarkup(item, item.caption)}${item.caption ? `<figcaption>${esc(item.caption)}</figcaption>` : ""}`;
      if (item.position === "before-purchase") {
        document.querySelector('[data-media="purchase"]')?.before(figure);
      } else if (item.position === "before-trust") {
        document.querySelector("[data-trust]")?.closest("section")?.before(figure);
      } else {
        defaultContainer.append(figure);
      }
    }
    rendering = false;
    observer?.observe(defaultContainer, { childList: true });
  };
  observer = new MutationObserver(() => queueMicrotask(renderPositions));
  observer.observe(defaultContainer, { childList: true });
  queueMicrotask(renderPositions);
}
