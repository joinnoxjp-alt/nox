import { app, db } from "./firebase-db.js";
import { collection, doc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { AGREEMENTS, MARKET_CATEGORIES, MARKET_CONDITIONS, MARKET_NOTICE, escapeHtml } from "./market-data.js";
import { initMarketShell } from "./market-shell.js";
initMarketShell(); document.querySelector("[data-notice]").textContent = MARKET_NOTICE;
document.querySelector("[data-category]").insertAdjacentHTML("beforeend", MARKET_CATEGORIES.map(value => `<option>${escapeHtml(value)}</option>`).join(""));
document.querySelector("[data-condition]").insertAdjacentHTML("beforeend", MARKET_CONDITIONS.map(value => `<option>${escapeHtml(value)}</option>`).join(""));
document.querySelector("[data-agreements]").innerHTML = AGREEMENTS.map((text, index) => `<label class="agreement-check"><input type="checkbox" name="agreement${index}" required><span>${escapeHtml(text)}</span></label>`).join("");
const form = document.querySelector("[data-donation-form]"), submit = document.querySelector("[data-submit]"), message = document.querySelector("[data-message]"), success = document.querySelector("[data-success]");
let submitted = false;
const sync = () => { submit.disabled = !AGREEMENTS.every((_, index) => form.elements[`agreement${index}`].checked); };
form.addEventListener("change", sync); sync();
async function validateImages(files) {
  if (!files.length || files.length > 5) return "商品画像は1〜5枚で選択してください。";
  for (const file of files) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024) return "画像はJPEG・PNG・WebPを各5MB以内で選択してください。";
    try {
      let width, height;
      if (typeof createImageBitmap === "function") {
        const bitmap = await createImageBitmap(file); width = bitmap.width; height = bitmap.height; bitmap.close();
      } else {
        const url = URL.createObjectURL(file);
        try { const image = new Image(); await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; }); width = image.naturalWidth; height = image.naturalHeight; }
        finally { URL.revokeObjectURL(url); }
      }
      const invalid = width < 1 || height < 1 || width > 12000 || height > 12000 || width * height > 50000000;
      if (invalid) return "画像の縦横サイズが大きすぎます。50メガピクセル以内の画像を選択してください。";
    } catch { return "読み取れない画像が含まれています。別の画像を選択してください。"; }
  }
  return "";
}
form.addEventListener("submit", async event => {
  event.preventDefault(); if (submit.disabled || submitted) return;
  const files = [...form.images.files];
  submit.disabled = true; message.textContent = "画像を確認しています…";
  const imageError = await validateImages(files);
  if (imageError) { message.textContent = imageError; sync(); return; }
  const shippingDate = new Date(`${form.shippingDate.value}T00:00:00`);
  if (Number.isNaN(shippingDate.getTime()) || shippingDate < new Date(new Date().toDateString())) { message.textContent = "発送予定日は本日以降を選択してください。"; sync(); return; }
  submitted = true; message.textContent = "画像をアップロードしています…";
  const donationRef = doc(collection(db, "marketDonations"));
  try {
    const storage = getStorage(app); const images = [];
    for (let index = 0; index < files.length; index++) {
      const file = files[index]; const extension = file.type.split("/")[1].replace("jpeg", "jpg");
      const path = `market-donations/${donationRef.id}/${index}-${crypto.randomUUID()}.${extension}`;
      await uploadBytes(ref(storage, path), file, { contentType: file.type });
      images.push({ path });
    }
    await setDoc(donationRef, { name: form.name.value.trim(), email: form.email.value.trim().toLowerCase(), phone: form.phone.value.trim(), category: form.category.value, brand: form.brand.value.trim(), productName: form.productName.value.trim(), condition: form.condition.value, description: form.description.value.trim(), images, shippingDate: form.shippingDate.value, agreements: Object.fromEntries(AGREEMENTS.map((_, index) => [`agreement${index + 1}`, true])), agreementVersion: 1, status: "申請受付", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    form.reset(); sync(); form.classList.add("hidden"); success.classList.remove("hidden"); success.focus();
  } catch (error) { console.error(error); submitted = false; sync(); message.textContent = "申請を送信できませんでした。通信環境をご確認のうえ、再度お試しください。"; }
});
