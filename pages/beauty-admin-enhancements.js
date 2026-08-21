import { app, auth, db } from "./firebase-db.js";
import { requireActiveAdmin } from "./admin-authorization.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getDownloadURL,
  getStorage,
  ref,
  deleteObject,
  uploadBytesResumable
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const storage = getStorage(app);
const esc = (value) => String(value ?? "").replace(
  /[&<>\"]/g,
  (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character])
);
const yen = (value) => `${Number(value || 0).toLocaleString("ja-JP")}円`;

function section(title, body) {
  const element = document.createElement("section");
  element.className = "admin-section beauty-admin-enhancement";
  element.innerHTML = `<h2>${title}</h2>${body}`;
  return element;
}

async function uploadFile(file, path, onProgress) {
  const task = uploadBytesResumable(ref(storage, path), file, {
    contentType: file.type
  });
  await new Promise((resolve, reject) => task.on(
    "state_changed",
    (snapshot) => onProgress?.(Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100)),
    reject,
    resolve
  ));
  return {
    url: await getDownloadURL(task.snapshot.ref),
    path,
    type: file.type === "video/mp4" ? "video" : "image",
    isVisible: true
  };
}

async function installCommerceSettings(root) {
  const target = section("銀行振込・送料設定", `
    <form data-commerce-settings>
      <div class="notice"><b>振込先種別：NOX運営者本人名義</b><br>NOXは現在、個人事業として運営しているため、購入者への振込先はNOX運営者本人名義の口座です。MIRÈIOへの直接振込ではありません。</div>
      <div class="admin-grid">
        <label>銀行名<input name="bankName" autocomplete="off" required></label>
        <label>支店名<input name="branchName" autocomplete="off" required></label>
        <label>口座種別<select name="accountType"><option>普通</option><option>当座</option></select></label>
        <label>口座番号<input name="accountNumber" inputmode="numeric" autocomplete="off" required></label>
        <label>口座名義<input name="accountHolder" autocomplete="off" required></label>
        <label>振込期限（日）<input name="paymentDueDays" type="number" min="1" max="30" value="7"></label>
        <label style="grid-column:1/-1">送料表示<input name="shippingLabel" value="送料別途 / 地域により異なる" required></label>
        <label style="grid-column:1/-1"><input name="salesEnabled" type="checkbox"> 販売受付をONにする（本番テスト完了まではOFF）</label>
      </div>
      <button class="beauty-button" type="submit">振込・送料設定を保存</button>
      <p data-commerce-status role="status"></p>
    </form>`);
  root.append(target);
  const form = target.querySelector("form");
  const snapshot = await getDoc(doc(db, "beautySettings", "commerce"));
  if (snapshot.exists()) {
    for (const [key, value] of Object.entries(snapshot.data())) {
      if (!form.elements[key]) continue;
      if (form.elements[key].type === "checkbox") form.elements[key].checked = value === true;
      else form.elements[key].value = value ?? "";
    }
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    data.paymentDueDays = Number(data.paymentDueDays);
    data.salesEnabled = form.elements.salesEnabled.checked;
    data.recipientType = "NOX運営者本人名義";
    await setDoc(doc(db, "beautySettings", "commerce"), {
      ...data,
      updatedAt: serverTimestamp()
    }, { merge: true });
    target.querySelector("[data-commerce-status]").textContent = "保存しました。";
  });
}

async function installProductMedia(root) {
  const target = section("商品別メディア管理", `
    <p>② AMPOULE詳細｜アンプルの商品説明部分<br>③ MIST詳細｜ミストの商品説明部分<br>④ CREAM詳細｜クリームの商品説明部分<br>各商品のメイン画像・詳細画像最大10枚・MP4最大3本を管理します。</p>
    <div class="admin-grid">
      <label>商品<select data-media-product></select></label>
      <label>登録区分<select data-media-kind><option value="main">商品メイン画像（1枚）</option><option value="details">追加画像（最大10枚）</option><option value="videos">商品動画（最大3本）</option><option value="ingredient">成分・使い方画像（1枚）</option></select></label>
      <label style="grid-column:1/-1">ファイル<input data-product-files type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4"></label>
    </div>
    <button class="beauty-button" data-upload-product-media>アップロード</button>
    <p data-product-media-status role="status"></p>
    <div class="media-grid" data-product-media-preview></div>`);
  root.append(target);
  const productSelect = target.querySelector("[data-media-product]");
  const snapshot = await getDocs(query(collection(db, "beautyProducts"), orderBy("displayOrder")));
  const products = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  productSelect.innerHTML = products.map((product) => {
    const number = product.id === "ampoule" ? "②" : product.id === "mist" ? "③" : product.id === "cream" ? "④" : "";
    return `<option value="${product.id}">${number} ${esc(product.shortName)}｜${esc(product.name)}</option>`;
  }).join("");

  async function preview() {
    const snapshot = await getDoc(doc(db, "beautyProducts", productSelect.value));
    const product = snapshot.data() || {};
    const media = [
      product.mainImage && { ...product.mainImage, field: "mainImage", index: 0, label: "商品メイン画像" },
      ...(product.detailImages || []).map((item, index) => ({ ...item, field: "detailImages", index, label: `追加画像 ${index + 1}` })),
      ...(product.videos || []).map((item, index) => ({ ...item, field: "videos", index, label: `商品動画 ${index + 1}` })),
      product.ingredientImage && { ...product.ingredientImage, field: "ingredientImage", index: 0, label: "成分・使い方画像" }
    ].filter(Boolean);
    target.querySelector("[data-product-media-preview]").innerHTML = media.length
      ? media.map((item) => `<article class="media-card"><b>${esc(item.label)}</b>${item.type === "video" ? `<video src="${esc(item.url)}" controls muted></video>` : `<img src="${esc(item.url)}" alt="">`}<small>${esc(item.path)}</small><button class="beauty-button secondary" data-remove-product-media="${esc(item.field)}" data-index="${item.index}">削除</button></article>`).join("")
      : "<p>登録メディアはありません。</p>";
    target.querySelectorAll("[data-remove-product-media]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!confirm("この商品メディアを削除しますか？")) return;
        const field = button.dataset.removeProductMedia;
        const index = Number(button.dataset.index);
        const currentSnapshot = await getDoc(doc(db, "beautyProducts", productSelect.value));
        const current = currentSnapshot.data() || {};
        const item = field === "mainImage" || field === "ingredientImage"
          ? current[field]
          : (current[field] || [])[index];
        const updates = { updatedAt: serverTimestamp() };
        if (field === "mainImage" || field === "ingredientImage") updates[field] = null;
        else updates[field] = (current[field] || []).filter((_, itemIndex) => itemIndex !== index);
        await updateDoc(doc(db, "beautyProducts", productSelect.value), updates);
        if (item?.path) await deleteObject(ref(storage, item.path)).catch(() => {});
        await preview();
      });
    });
  }
  productSelect.addEventListener("change", preview);
  await preview();

  target.querySelector("[data-upload-product-media]").addEventListener("click", async () => {
    const files = [...target.querySelector("[data-product-files]").files];
    const kind = target.querySelector("[data-media-kind]").value;
    const status = target.querySelector("[data-product-media-status]");
    if (!files.length) return;
    const productRef = doc(db, "beautyProducts", productSelect.value);
    const snapshot = await getDoc(productRef);
    const product = snapshot.data() || {};
    const images = files.filter((file) => file.type.startsWith("image/"));
    const videos = files.filter((file) => file.type === "video/mp4");
    if (files.some((file) => file.size > 30 * 1024 * 1024)) throw new Error("30MBを超えるファイルがあります。");
    if (kind === "videos" && (videos.length !== files.length || (product.videos || []).length + videos.length > 3)) throw new Error("商品動画はMP4を最大3本まで登録できます。");
    if (kind !== "videos" && images.length !== files.length) throw new Error("この枠には画像を選択してください。");
    if (kind === "details" && (product.detailImages || []).length + images.length > 10) throw new Error("追加画像は最大10枚です。");
    const uploaded = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      status.textContent = `${index + 1}/${files.length} アップロード中…`;
      uploaded.push(await uploadFile(
        file,
        `beauty/mireio/products/${productSelect.value}-${kind}-${Date.now()}-${index}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
        (percent) => { status.textContent = `${index + 1}/${files.length} ${percent}%`; }
      ));
    }
    const updates = { updatedAt: serverTimestamp() };
    if (kind === "main") updates.mainImage = uploaded.at(-1);
    if (kind === "details") updates.detailImages = [...(product.detailImages || []), ...uploaded];
    if (kind === "videos") updates.videos = [...(product.videos || []), ...uploaded];
    if (kind === "ingredient") updates.ingredientImage = uploaded.at(-1);
    await updateDoc(productRef, updates);
    status.textContent = "登録しました。";
    await preview();
  });
}

async function installSettlementAudit(root) {
  const target = section("精算内訳・対象理由", `
    <button class="beauty-button secondary" data-refresh-settlement>最新状態を表示</button>
    <div data-settlement-audit></div>`);
  root.append(target);
  async function render() {
    const snapshot = await getDocs(query(collection(db, "beautyOrders"), orderBy("createdAt", "asc")));
    const orders = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((order) =>
      order.settlementStatus !== "settled"
      && ["paid", "fulfillment_requested", "shipped", "completed"].includes(order.orderStatus)
    );
    const quantity = orders.reduce((sum, order) => sum + Number(order.quantity || 0), 0);
    const oldest = orders[0]?.createdAt?.toMillis?.() || Infinity;
    const reason = quantity >= 10
      ? "未精算販売数10個到達"
      : quantity > 0 && Date.now() - oldest >= 7 * 86_400_000
        ? "10個未満・最古の未精算注文から7日経過"
        : "精算条件未到達";
    target.querySelector("[data-settlement-audit]").innerHTML = `<p><b>判定理由：${reason}</b></p>${orders.map((order) => `
      <article class="order-card">
        <b>${esc(order.productName)} × ${Number(order.quantity || 0)}</b>
        <p>販売額 ${yen(order.subtotal)} / NOX 20% ${yen(order.noxReward)} / MIRÈIO 80% ${yen(Number(order.subtotal || 0) - Number(order.noxReward || 0))} / 送料 ${yen(order.shippingFee)} / MIRÈIO支払額 ${yen(order.mireioSettlement)}</p>
      </article>`).join("") || "<p>精算対象の注文はありません。</p>"}`;
  }
  target.querySelector("[data-refresh-settlement]").addEventListener("click", render);
  await render();
}

async function enhanceAdditionalSlots() {
  const snapshot = await getDoc(doc(db, "beautyBrands", "mireio"));
  const brand = snapshot.data() || {};
  document.querySelectorAll('[data-slot^="extraMedia"]').forEach((card) => {
    if (card.querySelector("[data-extra-settings]")) return;
    const index = Number(card.dataset.slot.replace("extraMedia", ""));
    const circledNumber = ["⑨", "⑩", "⑪", "⑫"][index];
    const heading = card.querySelector("b");
    if (heading) heading.textContent = `${circledNumber} 追加PRメディア`;
    const media = (brand.extraMedia || [])[index] || {};
    const controls = document.createElement("div");
    controls.dataset.extraSettings = "";
    controls.innerHTML = `
      <label>キャプション<input data-extra-caption value="${esc(media.caption || "")}"></label>
      <label>表示順<input data-extra-order type="number" min="1" value="${Number(media.displayOrder || index + 9)}"></label>
      <label>表示位置<select data-extra-position>
        <option value="after-products" ${media.position === "after-products" ? "selected" : ""}>商品一覧の後</option>
        <option value="before-trust" ${media.position === "before-trust" ? "selected" : ""}>安心情報の前</option>
        <option value="before-purchase" ${media.position === "before-purchase" ? "selected" : ""}>購入CTAの前</option>
      </select></label>
      <button class="beauty-button secondary" data-save-extra-settings>表示設定を保存</button>`;
    card.append(controls);
    controls.querySelector("[data-save-extra-settings]").addEventListener("click", async () => {
      const currentSnapshot = await getDoc(doc(db, "beautyBrands", "mireio"));
      const current = currentSnapshot.data() || {};
      const mediaList = [...(current.extraMedia || [])];
      mediaList[index] = {
        ...(mediaList[index] || {}),
        caption: controls.querySelector("[data-extra-caption]").value.trim(),
        displayOrder: Number(controls.querySelector("[data-extra-order]").value),
        position: controls.querySelector("[data-extra-position]").value
      };
      await updateDoc(doc(db, "beautyBrands", "mireio"), {
        extraMedia: mediaList,
        updatedAt: serverTimestamp()
      });
    });
  });
}

function enhanceOrderCards() {
  document.querySelectorAll("[data-save-order]").forEach((button) => {
    if (button.dataset.financialEnhanced === "true") return;
    button.dataset.financialEnhanced = "true";
    const orderId = button.dataset.saveOrder;
    const label = document.createElement("label");
    label.innerHTML = `送料（円・確定時に入力）<input data-shipping-fee="${esc(orderId)}" type="number" min="0" step="1" placeholder="未確定">`;
    button.before(label);
    getDoc(doc(db, "beautyOrders", orderId)).then((snapshot) => {
      if (snapshot.exists() && snapshot.data().shippingStatus === "confirmed") {
        label.querySelector("input").value = Number(snapshot.data().shippingFee || 0);
      }
    }).catch(console.error);
    button.addEventListener("click", async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
      const orderReference = doc(db, "beautyOrders", orderId);
      const snapshot = await getDoc(orderReference);
      if (!snapshot.exists()) return;
      const order = snapshot.data();
      const orderStatus = document.querySelector(`[data-order-status="${CSS.escape(orderId)}"]`)?.value;
      const rawShippingFee = label.querySelector("input").value;
      const updates = {
        paymentStatus: ["paid", "fulfillment_requested", "shipped", "completed"].includes(orderStatus)
          ? "paid"
          : orderStatus === "cancelled" ? "cancelled" : "unpaid",
        updatedAt: serverTimestamp()
      };
      if (rawShippingFee !== "") {
        const shippingFee = Number(rawShippingFee);
        if (!Number.isInteger(shippingFee) || shippingFee < 0) throw new Error("送料は0以上の整数で入力してください。");
        updates.shippingFee = shippingFee;
        updates.shippingStatus = "confirmed";
        updates.total = Number(order.subtotal || 0) + shippingFee;
        updates.mireioSettlement = Number(order.subtotal || 0) - Number(order.noxReward || 0) + shippingFee;
      }
      await updateDoc(orderReference, updates);
    });
  });
}

async function install() {
  const user = await requireActiveAdmin({
    auth,
    db,
    loginUrl: "./login.html?reason=admin-required"
  });
  if (!user) return;
  const root = document.querySelector("main.admin");
  await installCommerceSettings(root);
  await installProductMedia(root);
  await installSettlementAudit(root);
  const observer = new MutationObserver(() => {
    document.querySelectorAll("[data-slot]").forEach((card) => {
      const heading = card.querySelector("b");
      if (heading?.textContent.includes("② ブランド紹介")) {
        heading.textContent = "ブランド紹介画像 / 動画（番号なし）";
      }
    });
    enhanceAdditionalSlots().catch(console.error);
  });
  observer.observe(document.querySelector("[data-brand-media]"), { childList: true });
  await enhanceAdditionalSlots();
  const orderObserver = new MutationObserver(enhanceOrderCards);
  orderObserver.observe(document.querySelector("[data-orders]"), { childList: true });
  enhanceOrderCards();
}

install().catch((error) => {
  console.error(error);
  const state = document.querySelector("[data-state]");
  if (state) state.textContent = `追加管理機能エラー: ${error.message}`;
});
