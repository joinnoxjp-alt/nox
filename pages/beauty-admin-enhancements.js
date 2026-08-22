import { app, auth, db } from "./firebase-db.js";
import { requireActiveAdmin } from "./admin-authorization.js";
import {
  collection,
  deleteDoc,
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

const mediaUiStyles = document.createElement("style");
mediaUiStyles.textContent = `
  .media-grid{gap:12px}.media-card{padding:14px}.media-card img,.media-card video{height:240px;max-height:none;object-fit:contain}
  .media-purpose{color:#d9bd78!important;font-weight:700;margin-top:6px}.media-recommendation{margin:5px 0;color:#d5dae3}
  .media-status{display:inline-block;margin:10px 0 4px;padding:5px 9px;border-radius:999px;background:#7b3039;color:#fff;font-weight:700}
  .media-status.registered{background:#286a4d}.visibility-switch{display:flex!important;align-items:center;gap:8px;margin:10px 0;font-weight:600!important}
  .visibility-switch input{appearance:none;width:42px!important;min-height:24px!important;height:24px;margin:0!important;padding:0!important;border-radius:999px;background:#536079;position:relative;cursor:pointer}
  .visibility-switch input:before{content:"";position:absolute;width:18px;height:18px;left:3px;top:3px;border-radius:50%;background:#fff;transition:.2s}
  .visibility-switch input:checked{background:#b99a50}.visibility-switch input:checked:before{transform:translateX(18px)}
  .media-details{margin-top:18px;border:1px solid #40506b;background:#091323}.media-details summary{padding:14px;cursor:pointer;color:#d9bd78;font-weight:700}
  .media-details>.media-grid{padding:0 12px 12px}.current-media-intro{margin-bottom:12px;color:#d5dae3}.media-shortcut{text-align:left;color:#fff;cursor:pointer;min-height:130px!important}.media-shortcut:hover,.media-shortcut:focus{border-color:#d9bd78}.media-shortcut small,.media-shortcut span{display:block;margin-top:7px;color:#d5dae3}.media-shortcut b{color:#d9bd78}
  @media(max-width:650px){.admin-section{margin:16px 0;padding:14px}.media-card{padding:12px}.media-card img,.media-card video{height:210px}.media-details>.media-grid{padding:0 8px 8px}}
`;
document.head.append(mediaUiStyles);

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
  const target = section("現在使用するメディア｜②〜④", `
    <p>各商品のメイン画像・詳細画像最大10枚・MP4最大3本を管理します。</p>
    <div class="media-grid current-product-media">
      <button type="button" class="media-card media-shortcut" data-product-shortcut="ampoule"><b>② AMPOULE詳細</b><small>AMPOULEの商品説明部分に表示</small><span>推奨素材：アンプル単品画像</span></button>
      <button type="button" class="media-card media-shortcut" data-product-shortcut="mist"><b>③ MIST詳細</b><small>MISTの商品説明部分に表示</small><span>推奨素材：ミスト単品画像</span></button>
      <button type="button" class="media-card media-shortcut" data-product-shortcut="cream"><b>④ CREAM詳細</b><small>CREAMの商品説明部分に表示</small><span>推奨素材：クリーム単品画像</span></button>
    </div>
    <div class="admin-grid">
      <label>商品<select data-media-product></select></label>
      <label>登録区分<select data-media-kind><option value="main">商品メイン画像（1枚）</option><option value="details">追加画像（最大10枚）</option><option value="videos">商品動画（最大3本）</option><option value="ingredient">成分・使い方画像（1枚）</option></select></label>
      <label style="grid-column:1/-1">ファイル<input data-product-files type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4"></label>
    </div>
    <button class="beauty-button" data-upload-product-media>アップロード</button>
    <p data-product-media-status role="status"></p>
    <div class="media-grid" data-product-media-preview></div>`);
  const brandSection = root.querySelector(".admin-section");
  brandSection.insertAdjacentElement("afterend", target);
  const productSelect = target.querySelector("[data-media-product]");
  const snapshot = await getDocs(query(collection(db, "beautyProducts"), orderBy("displayOrder")));
  const products = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  productSelect.innerHTML = products.map((product) => {
    const number = product.id === "ampoule" ? "②" : product.id === "mist" ? "③" : product.id === "cream" ? "④" : "";
    const purpose = product.id === "ampoule" ? "AMPOULEの商品説明部分に表示｜推奨：アンプル単品画像" : product.id === "mist" ? "MISTの商品説明部分に表示｜推奨：ミスト単品画像" : product.id === "cream" ? "CREAMの商品説明部分に表示｜推奨：クリーム単品画像" : "商品ページに表示";
    return `<option value="${product.id}">${number} ${esc(product.shortName)}｜${esc(purpose)}</option>`;
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
  target.querySelectorAll("[data-product-shortcut]").forEach((button) => button.addEventListener("click", async () => {
    productSelect.value = button.dataset.productShortcut;
    await preview();
    productSelect.focus();
  }));
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

async function installExternalReviewManagement(root) {
  const target = section("外部クチコミ管理", `
    <p>実際に確認できる公開クチコミのみ、短い抜粋または要約と出典URLを登録してください。長文転載や架空レビューは禁止です。</p>
    <form data-external-review-form><input type="hidden" name="id">
      <div class="admin-grid">
        <label>ブランドID<input name="brandId" value="mireio" required></label>
        <label>商品ID（任意）<select name="productId"><option value="">ブランド全体</option><option value="mist">MIST</option><option value="ampoule">AMPOULE</option><option value="cream">CREAM</option><option value="three-step-set">3STEP SET</option></select></label>
        <label>投稿者表示名<input name="authorName" placeholder="Instagramユーザー"></label>
        <label>評価（元投稿に存在する場合のみ）<input name="rating" type="number" min="1" max="5" step="0.1" placeholder="未入力可"></label>
        <label style="grid-column:1/-1">クチコミ本文・短い抜粋<textarea name="quote" maxlength="300" required></textarea></label>
        <label style="grid-column:1/-1">NOX側の要約文（任意）<textarea name="summary" maxlength="200"></textarea></label>
        <label>出典サービス<select name="sourcePlatform" required><option>Instagram</option><option>TikTok</option><option>X</option><option>Google</option><option>公式販売ページ</option><option>その他</option></select></label>
        <label>出典URL<input name="sourceUrl" type="url" inputmode="url" placeholder="https://" required></label>
        <label>投稿日（確認できる場合）<input name="sourceDate" type="date"></label>
        <label>掲載順<input name="displayOrder" type="number" min="1" value="1" required></label>
        <label><input name="isPublic" type="checkbox"> 公開する</label>
      </div>
      <div class="button-row"><button class="beauty-button" type="submit">クチコミを保存</button><button class="beauty-button secondary" type="button" data-review-reset>新規入力に戻す</button></div><p data-review-status role="status"></p>
    </form><div data-external-review-list></div>`);
  root.append(target);
  const form = target.querySelector("form");
  const list = target.querySelector("[data-external-review-list]");
  const reset = () => { form.reset(); form.id.value = ""; form.brandId.value = "mireio"; form.displayOrder.value = "1"; };
  async function render() {
    const snapshot = await getDocs(collection(db, "beautyExternalReviews"));
    const reviews = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
    list.innerHTML = reviews.length ? reviews.map((review) => `<article class="order-card"><b>${esc(review.sourcePlatform)}｜${esc(review.authorName || "投稿者名非表示")}</b><p>${esc(review.summary || review.quote)}</p><small>${esc(review.brandId)}${review.productId ? ` / ${esc(review.productId)}` : ""}｜${review.isPublic ? "公開" : "非公開"}</small><div class="button-row"><button class="beauty-button secondary" data-edit-review="${review.id}">編集</button><button class="beauty-button secondary" data-delete-review="${review.id}">削除</button><a class="beauty-button secondary" href="${esc(review.sourceUrl)}" target="_blank" rel="noopener noreferrer">出典を確認</a></div></article>`).join("") : "<p>登録済みの外部クチコミはありません。</p>";
    list.querySelectorAll("[data-edit-review]").forEach((button) => button.addEventListener("click", () => {
      const review = reviews.find((item) => item.id === button.dataset.editReview);
      for (const [key, value] of Object.entries(review)) if (form.elements[key]) form.elements[key].type === "checkbox" ? form.elements[key].checked = value === true : form.elements[key].value = value ?? "";
      form.id.value = review.id; form.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    list.querySelectorAll("[data-delete-review]").forEach((button) => button.addEventListener("click", async () => {
      if (!confirm("この外部クチコミを削除しますか？")) return;
      await deleteDoc(doc(db, "beautyExternalReviews", button.dataset.deleteReview)); await render();
    }));
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    let sourceUrl;
    try { sourceUrl = new URL(values.sourceUrl); } catch { throw new Error("有効な出典URLを入力してください。"); }
    if (sourceUrl.protocol !== "https:") throw new Error("出典URLはHTTPSのみ登録できます。");
    const reference = values.id ? doc(db, "beautyExternalReviews", values.id) : doc(collection(db, "beautyExternalReviews"));
    await setDoc(reference, { brandId: values.brandId.trim(), productId: values.productId || "", authorName: values.authorName.trim(), rating: values.rating ? Number(values.rating) : null, quote: values.quote.trim(), summary: values.summary.trim(), sourcePlatform: values.sourcePlatform, sourceUrl: sourceUrl.href, sourceDate: values.sourceDate || "", displayOrder: Number(values.displayOrder), isPublic: form.elements.isPublic.checked, updatedAt: serverTimestamp(), ...(!values.id ? { createdAt: serverTimestamp() } : {}) }, { merge: true });
    target.querySelector("[data-review-status]").textContent = "保存しました。"; reset(); await render();
  });
  target.querySelector("[data-review-reset]").addEventListener("click", reset);
  await render();
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

function organizeBrandMedia() {
  const originalGrid = document.querySelector("[data-brand-media]");
  if (!originalGrid || !originalGrid.children.length) return;
  const cards = [...originalGrid.querySelectorAll("[data-slot]")];
  const hero = cards.find((card) => card.dataset.slot === "heroMedia");
  const section = originalGrid.closest(".admin-section");
  let wrapper = section.querySelector(".media-operations");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "media-operations";
    wrapper.innerHTML = `<h3>現在使用するメディア</h3><p class="current-media-intro">通常運用では、①と直下の②〜④の商品別メディアを確認してください。</p><div data-current-media></div><details class="media-details"><summary>追加メディア・拡張設定（⑤〜⑫）</summary><div class="media-grid" data-extra-media></div></details>`;
    originalGrid.before(wrapper);
    wrapper.querySelector("[data-current-media]").append(originalGrid);
  }
  cards.filter((card) => card !== hero).forEach((card) => wrapper.querySelector("[data-extra-media]").append(card));
  const descriptions = {
    heroMedia: ["① ファーストビュー", "ブランドページ最上部に表示", "推奨素材：総合広告画像"],
    reasonMedia: ["ブランド紹介（補助枠）", "NOXがMIRÈIOを取り扱う理由の直後に表示", "推奨素材：ブランド紹介画像"],
    storyMedia: ["⑤ ブランドストーリー", "MIRÈIOとは？の説明部分に表示", "推奨素材：ブランドストーリー画像"],
    stepMedia: ["⑥ 3STEP紹介", "MIST → AMPOULE → CREAMの紹介部分に表示", "推奨素材：3STEP紹介画像"],
    trustMedia: ["⑦ 信頼・製造情報", "商品情報・安心情報部分に表示", "推奨素材：製造・信頼情報画像"],
    purchaseMedia: ["⑧ 購入直前PR", "ページ最下部の購入CTA直前に表示", "推奨素材：購入直前PR画像"],
    extraMedia0: ["⑨ 追加PR", "指定した追加位置に表示", "推奨素材：追加PR画像・動画"],
    extraMedia1: ["⑩ 追加PR", "指定した追加位置に表示", "推奨素材：追加PR画像・動画"],
    extraMedia2: ["⑪ 追加PR", "指定した追加位置に表示", "推奨素材：追加PR画像・動画"],
    extraMedia3: ["⑫ 追加PR", "指定した追加位置に表示", "推奨素材：追加PR画像・動画"]
  };
  cards.forEach((card) => {
    if (card.dataset.mediaUiEnhanced === "true") return;
    card.dataset.mediaUiEnhanced = "true";
    const [title, purpose, recommendation] = descriptions[card.dataset.slot];
    card.querySelector("b").textContent = title;
    const help = card.querySelector("small");
    help.className = "media-purpose";
    help.textContent = purpose;
    const recommendationElement = document.createElement("p");
    recommendationElement.className = "media-recommendation";
    recommendationElement.textContent = recommendation;
    help.after(recommendationElement);
    const registered = Boolean(card.querySelector("img,video"));
    const status = document.createElement("span");
    status.className = `media-status${registered ? " registered" : ""}`;
    status.textContent = registered ? "保存済み" : "未登録";
    recommendationElement.after(status);
    const visibility = card.querySelector("[data-visible]")?.closest("label");
    if (visibility) visibility.className = "visibility-switch";
  });
  section.querySelector(".flow")?.setAttribute("hidden", "");
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
  await installExternalReviewManagement(root);
  await installSettlementAudit(root);
  const observer = new MutationObserver(() => {
    document.querySelectorAll("[data-slot]").forEach((card) => {
      const heading = card.querySelector("b");
      if (heading?.textContent.includes("② ブランド紹介")) {
        heading.textContent = "ブランド紹介画像 / 動画（番号なし）";
      }
    });
    enhanceAdditionalSlots().catch(console.error);
    organizeBrandMedia();
  });
  observer.observe(document.querySelector("[data-brand-media]"), { childList: true });
  organizeBrandMedia();
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
