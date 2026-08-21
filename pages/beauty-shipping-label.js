function applyShippingLabels() {
  document.querySelectorAll(".product-price, .price-large").forEach((price) => {
    if (price.parentElement.querySelector(":scope > .shipping-label")) return;
    const label = document.createElement("small");
    label.className = "shipping-label";
    label.textContent = "送料別途 / 地域により異なります";
    price.after(label);
  });
}

const observer = new MutationObserver(applyShippingLabels);
observer.observe(document.body, { childList: true, subtree: true });
applyShippingLabels();
