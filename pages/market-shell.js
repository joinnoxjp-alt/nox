export function initMarketShell() {
  const button = document.querySelector("[data-market-menu]");
  const nav = document.querySelector("[data-market-nav]");
  if (!button || !nav) return;
  button.addEventListener("click", () => {
    const open = nav.hasAttribute("hidden");
    nav.toggleAttribute("hidden", !open);
    button.setAttribute("aria-expanded", String(open));
  });
}
