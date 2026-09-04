// ============================================================
// IMAGE SETTINGS — /noxia/images/ 内の画像を参照します
// ============================================================
const IMAGES = {
  logo: "/noxia/images/noxia-logo.png",
  hero: "/noxia/images/noxia-main.png",
  audition: "/noxia/images/noxia-audition.png"
};

const isRealUrl = (value) => /^(https?:\/\/|\.\.?(?:\/|$)|\/)/.test(value);

document.querySelectorAll("img[data-image]").forEach((img) => {
  const url = IMAGES[img.dataset.image];
  const shell = img.closest(".image-shell");
  if (!isRealUrl(url)) {
    img.hidden = true;
    shell?.classList.add("is-fallback");
    return;
  }
  img.src = url;
  img.addEventListener("load", () => shell?.classList.add("is-loaded"), { once: true });
  img.addEventListener("error", () => {
    img.hidden = true;
    shell?.classList.add("is-fallback");
  }, { once: true });
});

const loader = document.querySelector("#loader");
window.addEventListener("load", () => window.setTimeout(() => loader.classList.add("is-hidden"), 650));
window.setTimeout(() => loader.classList.add("is-hidden"), 2800);

const particles = document.querySelector("#particles");
const particleCount = window.matchMedia("(max-width: 700px)").matches ? 16 : 28;
for (let i = 0; i < particleCount; i += 1) {
  const dot = document.createElement("i");
  dot.style.setProperty("--x", `${Math.random() * 100}%`);
  dot.style.setProperty("--y", `${Math.random() * 100}%`);
  dot.style.setProperty("--s", `${1 + Math.random() * 3}px`);
  dot.style.setProperty("--d", `${12 + Math.random() * 18}s`);
  dot.style.setProperty("--delay", `${-Math.random() * 20}s`);
  particles.append(dot);
}

const header = document.querySelector("#siteHeader");
const menuToggle = document.querySelector("#menuToggle");
const nav = document.querySelector("#globalNav");
const closeMenu = () => {
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "メニューを開く");
  nav.classList.remove("is-open");
  document.body.classList.remove("menu-open");
};
menuToggle.addEventListener("click", () => {
  const open = menuToggle.getAttribute("aria-expanded") !== "true";
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "メニューを閉じる" : "メニューを開く");
  nav.classList.toggle("is-open", open);
  document.body.classList.toggle("menu-open", open);
});
nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
window.addEventListener("scroll", () => header.classList.toggle("is-scrolled", window.scrollY > 30), { passive: true });

const revealObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: "0px 0px -40px" });
document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));

const deadline = new Date("2026-09-30T23:59:00+09:00").getTime();
const countdown = document.querySelector("#countdown");
const twoDigits = (number) => String(number).padStart(2, "0");
const updateCountdown = () => {
  const remaining = Math.max(0, deadline - Date.now());
  const values = {
    days: Math.floor(remaining / 86400000),
    hours: Math.floor((remaining % 86400000) / 3600000),
    minutes: Math.floor((remaining % 3600000) / 60000),
    seconds: Math.floor((remaining % 60000) / 1000)
  };
  Object.entries(values).forEach(([id, value]) => document.querySelector(`#${id}`).textContent = twoDigits(value));
  if (remaining === 0) countdown.classList.add("is-closed");
};
updateCountdown();
window.setInterval(updateCountdown, 1000);

if (window.matchMedia("(hover: hover) and (prefers-reduced-motion: no-preference)").matches) {
  document.querySelectorAll("[data-tilt]").forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${-y * 5}deg) rotateY(${x * 7}deg) translateY(-5px)`;
    });
    card.addEventListener("pointerleave", () => card.style.transform = "");
  });
}
