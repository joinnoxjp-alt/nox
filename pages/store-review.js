import { db } from "./firebase-db.js";
import { addDoc, collection, getDocs, query, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const params = new URLSearchParams(location.search);
const requestedStoreId = params.get("storeId")?.trim() || "";
const validStoreId = /^[A-Za-z0-9_-]{1,128}$/.test(requestedStoreId) ? requestedStoreId : "";
let lockedStore = null;
let submitting = false;

function buildStars(containerId, name) {
  const container = document.getElementById(containerId);
  for (let value = 5; value >= 1; value -= 1) {
    const input = document.createElement("input");
    input.type = "radio"; input.name = name; input.id = `${name}${value}`; input.value = String(value); input.required = true;
    const label = document.createElement("label"); label.htmlFor = input.id; label.textContent = "★"; label.title = `${value}点`;
    container.append(input, label);
  }
}

buildStars("flowStars", "flowRating");
buildStars("supportStars", "supportRating");

async function resolveStore() {
  if (!validStoreId) return;
  try {
    const jobs = await getDocs(query(collection(db, "jobs"), where("storeId", "==", validStoreId), where("status", "==", "approved"), where("isPublic", "==", true), where("contractListingStatus", "==", "active")));
    const job = jobs.docs[0]?.data();
    if (!job) return;
    lockedStore = { id: validStoreId, name: String(job.storeName || "").slice(0, 120), logo: String(job.storeLogoUrl || job.logoUrl || "").slice(0, 2000) };
    if (!lockedStore.name) return;
    document.getElementById("storeName").value = lockedStore.name;
    document.getElementById("storeName").readOnly = true;
    document.getElementById("lockedStoreName").textContent = lockedStore.name;
    const logo = document.getElementById("storeLogo");
    if (lockedStore.logo) logo.src = lockedStore.logo; else logo.hidden = true;
    document.getElementById("storePreview").classList.remove("hidden");
  } catch (error) { console.warn("Store prefill was unavailable", error); }
}
resolveStore();

const form = document.getElementById("reviewForm");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitting || !form.reportValidity()) return;
  const get = (id) => document.getElementById(id).value.trim();
  const flow = Number(new FormData(form).get("flowRating"));
  const support = Number(new FormData(form).get("supportRating"));
  if (![flow, support].every((rating) => Number.isInteger(rating) && rating >= 1 && rating <= 5)) return;
  const button = document.getElementById("submitButton");
  const status = document.getElementById("formStatus");
  submitting = true; button.disabled = true; status.className = "status"; status.textContent = "送信中です...";
  try {
    await addDoc(collection(db, "storeReviews"), {
      storeId: lockedStore?.id || "", storeName: lockedStore?.name || get("storeName"), storeLogoUrl: lockedStore?.logo || "",
      source: get("source"), reason: get("reason"), flowRating: flow, supportRating: support,
      recommendation: get("recommendation"), comment: get("comment"), improvement: get("improvement"),
      publishPermission: get("publishPermission"), status: "pending", isPublic: false, featured: false,
      displayOrder: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), approvedAt: null, approvedBy: null
    });
    form.querySelectorAll("input,select,textarea,button").forEach((node) => { node.disabled = true; });
    status.className = "status success";
    status.textContent = "アンケートへのご協力ありがとうございました。内容をNOX運営にて確認させていただきます。";
  } catch (error) {
    console.error("Store review submission failed", error);
    submitting = false; button.disabled = false; status.className = "status error";
    status.textContent = "送信できませんでした。入力内容をご確認のうえ、時間をおいて再度お試しください。";
  }
});
