import { auth } from "/firebase.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const callable = httpsCallable(getFunctions(auth.app, "asia-northeast1"), "trackAnalyticsEvent");
const memory = new Map();
function storage(kind) { try { return window[kind]; } catch { return { getItem:key=>memory.get(key)||null, setItem:(key,value)=>memory.set(key,value) }; } }
const local = storage("localStorage");
const session = storage("sessionStorage");
function randomId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
let visitorId = local.getItem("nox_analytics_visitor");
if (!visitorId) { visitorId = randomId(); local.setItem("nox_analytics_visitor", visitorId); }
function attribution() {
  const params = new URLSearchParams(location.search), explicit = params.get("utm_source");
  let domain = ""; try { domain = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : ""; } catch {}
  const source = explicit || (domain.includes("google.") ? "google" : domain.includes("instagram.") ? "instagram" : domain.includes("tiktok.") ? "tiktok" : domain === "t.co" || domain.includes("x.com") ? "x" : domain.includes("line.me") ? "line" : domain ? "other" : "direct");
  return { source, medium: params.get("utm_medium") || "", campaign: params.get("utm_campaign") || "", referrerDomain: domain, landingPath: location.pathname.slice(0, 240) };
}

function pageType(pathname = location.pathname) {
  if (/\/(index\.html)?$/.test(pathname) || /\/day\/?(index\.html)?$/.test(pathname)) return "top";
  if (/\/(jobs|girls|men)\.html$/.test(pathname)) return "job_list";
  if (/\/job-detail\.html$/.test(pathname)) return "job_detail";
  if (/\/store-detail\.html$/.test(pathname)) return "store_detail";
  return "other";
}

function isPrivateAnalyticsPath(pathname = location.pathname) {
  return /^\/pages\/admin(?:-[^/]*)?\.html$/.test(pathname)
    || /^\/pages\/(job-admin|job-create|job-edit|store-dashboard)\.html$/.test(pathname)
    || /^\/day\/admin\.html$/.test(pathname);
}

async function send(type, details = {}, onceKey) {
  const key = onceKey && `nox_analytics_${onceKey}`;
  if (key && session.getItem(key)) return "duplicate-client";
  if (key) session.setItem(key, "pending");
  try {
    await callable({ type, visitorId, eventId: randomId(), ...details });
    if (key) session.setItem(key, "sent");
    return "recorded";
  } catch (error) {
    if (key) session.removeItem?.(key);
    console.warn("利用状況を記録できませんでした", error);
    return "failed";
  }
}

function trackPageView() {
  if (isPrivateAnalyticsPath()) return Promise.resolve("excluded-client");
  const key = `pv_${location.pathname}_${location.search}`;
  return send("page_view", { pageType: pageType(), ...attribution() }, key);
}

function trackAdImpression(adId, element) {
  if (!adId || !element) return;
  const onceKey = `imp_${adId}`;
  if (session.getItem(`nox_analytics_${onceKey}`)) return;
  let timer;
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5)
      && element.classList.contains("active") && document.visibilityState === "visible";
    clearTimeout(timer);
    if (visible) timer = setTimeout(() => { observer.disconnect(); send("ad_impression", { adId }, onceKey); }, 800);
  }, { threshold: [0.5] });
  observer.observe(element);
  setTimeout(() => observer.disconnect(), 10_000);
}

const api = {
  trackPageView,
  trackAdImpression,
  trackAdClick: adId => send("ad_click", { adId }),
  trackAiStart: () => send("ai_start", {}, `ai_start_${Date.now()}`),
  trackAiComplete: () => send("ai_complete", {}, `ai_complete_${Date.now()}`)
};
window.noxAnalytics = api;
trackPageView();
export default api;
