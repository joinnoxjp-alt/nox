import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

const functions = getFunctions(auth.app, 'asia-northeast1');
const load = httpsCallable(functions, 'getAdminStoreCustomerData');
const save = httpsCallable(functions, 'manageAdminStoreCustomerPage');
const storage = getStorage(auth.app);
let data = { stores: [], pages: [], reservations: [], daily: [] };
let selected = '';
let images = { mainImage: null, coverImage: null, galleryImages: [] };
let pendingDeletes = [];
const status = document.getElementById('status');
const select = document.getElementById('storeSelect');
const editor = document.getElementById('editor');
const search = document.getElementById('search');
if (new URLSearchParams(location.search).get('embedded') === '1') document.body.classList.add('embedded-admin');

const val = (form, name) => form.elements[name]?.value?.trim?.() || '';
const checked = (form, name) => form.elements[name]?.checked === true;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function options() {
  const query = search.value.trim().toLowerCase();
  const stores = data.stores.filter((store) => `${store.storeName || store.name || ''} ${store.id}`.toLowerCase().includes(query));
  select.innerHTML = '<option value="">選択してください</option>' + stores.map((store) => `<option value="${esc(store.id)}">${esc(store.storeName || store.name || store.id)}</option>`).join('');
  select.value = selected;
}

function toggleExternalFields() {
  document.getElementById('externalReservationFields').hidden = !checked(editor, 'externalReservationEnabled');
}

function fill() {
  const store = data.stores.find((item) => item.id === selected) || {};
  const page = data.pages.find((item) => item.id === selected) || {};
  editor.hidden = !selected;
  const meta = document.getElementById('selectedStoreMeta');
  meta.hidden = !selected;
  if (!selected) return;
  const merged = {
    storeName: store.storeName || store.name || '', category: store.businessType || '', description: store.description || '',
    address: store.address || '', station: store.station || store.nearestStation || '', businessHours: store.businessHours || '',
    closedDay: store.closedDay || '', phone: store.phone || '', lineUrl: store.lineUrl || store.officialLine || '', ...page,
  };
  for (const [key, value] of Object.entries(merged)) {
    const field = editor.elements[key];
    if (field && field.type !== 'checkbox') field.value = value ?? '';
  }
  for (const key of ['reservationFormEnabled', 'lineReservationEnabled', 'instagramReservationEnabled', 'xReservationEnabled', 'tiktokReservationEnabled', 'phoneReservationEnabled', 'externalReservationEnabled', 'benefitEnabled']) {
    editor.elements[key].checked = merged[key] === true;
  }
  editor.elements.enabled.value = String(merged.enabled === true);
  editor.elements.pricesText.value = (merged.prices || []).map((price) => `${price.label || ''} | ${price.price || ''} | ${price.note || ''}`).join('\n');
  document.getElementById('selectedStoreId').textContent = selected;
  document.getElementById('selectedStoreStatus').textContent = `${merged.enabled === true ? '機能有効' : '機能無効'} / ${{ published: '公開', draft: '下書き', stopped: '掲載停止' }[merged.status] || '未設定'}`;
  images = { mainImage: page.mainImage || null, coverImage: page.coverImage || null, galleryImages: Array.isArray(page.galleryImages) ? [...page.galleryImages] : [] };
  toggleExternalFields();
  preview();
  renderReservations();
  renderAnalytics();
}

function preview() {
  const singles = [['main', images.mainImage], ['cover', images.coverImage]].filter(([, image]) => image).map(([kind, image]) => `<figure><figcaption>${kind === 'main' ? 'プロフィール用メイン画像' : 'その他画像（既存カバー）'}</figcaption><img src="${esc(image.url)}" alt=""><button type="button" data-remove-kind="${kind}">削除</button></figure>`).join('');
  const gallery = images.galleryImages.map((image, index) => `<figure><figcaption>その他画像 ${index + 1}</figcaption><img src="${esc(image.url)}" alt=""><button type="button" data-move="${index}" data-direction="-1">前へ</button><button type="button" data-move="${index}" data-direction="1">後ろへ</button><button type="button" data-remove-gallery="${index}">削除</button></figure>`).join('');
  document.getElementById('imagePreview').innerHTML = singles + gallery;
  document.querySelectorAll('[data-remove-kind]').forEach((button) => { button.onclick = () => { const key = button.dataset.removeKind === 'main' ? 'mainImage' : 'coverImage'; if (images[key]?.storagePath) pendingDeletes.push(images[key].storagePath); images[key] = null; preview(); }; });
  document.querySelectorAll('[data-remove-gallery]').forEach((button) => { button.onclick = () => { const [removed] = images.galleryImages.splice(Number(button.dataset.removeGallery), 1); if (removed?.storagePath) pendingDeletes.push(removed.storagePath); preview(); }; });
  document.querySelectorAll('[data-move]').forEach((button) => { button.onclick = () => { const from = Number(button.dataset.move); const to = from + Number(button.dataset.direction); if (to < 0 || to >= images.galleryImages.length) return; [images.galleryImages[from], images.galleryImages[to]] = [images.galleryImages[to], images.galleryImages[from]]; preview(); }; });
}

async function upload(file, kind) {
  if (file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('画像はJPEG/PNG/WebP、5MB以下にしてください。');
  const path = `customer-pages/${selected}/${kind}/${crypto.randomUUID()}_${file.name.replace(/[^A-Za-z0-9._-]/g, '_')}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  return { url: await getDownloadURL(storageRef), storagePath: path, alt: '' };
}

function renderReservations() {
  const rows = data.reservations.filter((reservation) => reservation.storeId === selected);
  const labels = { new: '確認待ち', in_progress: '対応中', confirmed: '確認済み', visited: '来店済み', cancelled: 'キャンセル', invalid: '無効' };
  document.getElementById('reservations').innerHTML = rows.length ? `<div class="reservation-list">${rows.map((reservation) => `<article class="reservation-card"><header><strong>${esc(reservation.storeName || '店舗名未設定')}</strong><time>${esc(reservation.createdAt?._seconds ? new Date(reservation.createdAt._seconds * 1000).toLocaleString('ja-JP') : '')}</time></header><dl><div><dt>氏名</dt><dd>${esc(reservation.name)}</dd></div><div><dt>電話番号</dt><dd>${esc(reservation.phone)}</dd></div><div><dt>希望</dt><dd>${esc(reservation.desiredDate)} ${esc(reservation.desiredTime)} / ${esc(reservation.people)}名</dd></div><div><dt>ご希望内容</dt><dd>${esc(reservation.content || 'なし')}</dd></div><div><dt>備考</dt><dd>${esc(reservation.notes || 'なし')}</dd></div><div><dt>予約経路</dt><dd>${esc(reservation.sourceLabel || reservation.source || '未設定')}</dd></div><div><dt>NOX経由</dt><dd>${reservation.fromNox === true ? '「NOXを見た」でのご予約' : '未設定'}</dd></div><div><dt>限定特典</dt><dd>${reservation.benefitEligible === true ? `対象：${esc(reservation.benefitTitle || '名称未設定')}` : '対象外'}</dd></div><div><dt>jobId</dt><dd>${esc(reservation.jobId || 'なし')}</dd></div></dl><label>ステータス<select data-reservation="${esc(reservation.id)}">${Object.entries(labels).map(([key, label]) => `<option value="${key}" ${reservation.status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label></article>`).join('')}</div>` : '予約はありません。';
  document.querySelectorAll('[data-reservation]').forEach((element) => { element.onchange = () => save({ action: 'reservationStatus', reservationId: element.dataset.reservation, status: element.value }); });
}

function renderAnalytics() {
  const rows = data.daily.filter((row) => row.storeId === selected);
  const sum = (key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
  document.getElementById('analytics').textContent = `ページPV ${sum('page_view')} / 日別UU合計 ${sum('page_uu')} / 求人→店舗 ${sum('job_to_store')} / LINE ${sum('line_click')} / 電話 ${sum('phone_click')} / 外部予約 ${sum('external_click')} / フォーム ${sum('reservationForms')}`;
}

search.oninput = options;
select.onchange = () => { selected = select.value; pendingDeletes = []; fill(); };
editor.elements.externalReservationEnabled.addEventListener('change', toggleExternalFields);
editor.onsubmit = async (event) => {
  event.preventDefault();
  if (!confirm('この店舗の遊び・予約情報を更新します。よろしいですか？')) return;
  const button = editor.querySelector('button[type=submit]');
  button.disabled = true;
  status.textContent = '保存中…';
  try {
    const main = document.getElementById('mainFile').files[0];
    const gallery = [...document.getElementById('galleryFiles').files];
    if (main) images.mainImage = await upload(main, 'main');
    for (const file of gallery) images.galleryImages.push(await upload(file, 'gallery'));
    if (images.galleryImages.length > 20) throw new Error('その他画像は20枚までです。');
    const page = {
      storeId: selected, status: val(editor, 'status'), enabled: val(editor, 'enabled') === 'true', storeName: val(editor, 'storeName'), category: val(editor, 'category'),
      description: val(editor, 'description'), address: val(editor, 'address'), station: val(editor, 'station'), businessHours: val(editor, 'businessHours'), closedDay: val(editor, 'closedDay'),
      phone: val(editor, 'phone'), lineUrl: val(editor, 'lineUrl'), instagramUrl: val(editor, 'instagramUrl'), xUrl: val(editor, 'xUrl'), tiktokUrl: val(editor, 'tiktokUrl'), websiteUrl: val(editor, 'websiteUrl'),
      externalReservationUrl: val(editor, 'externalReservationUrl'), externalReservationLabel: val(editor, 'externalReservationLabel'), reservationFormEnabled: checked(editor, 'reservationFormEnabled'),
      lineReservationEnabled: checked(editor, 'lineReservationEnabled'), instagramReservationEnabled: checked(editor, 'instagramReservationEnabled'), xReservationEnabled: checked(editor, 'xReservationEnabled'),
      tiktokReservationEnabled: checked(editor, 'tiktokReservationEnabled'), phoneReservationEnabled: checked(editor, 'phoneReservationEnabled'), externalReservationEnabled: checked(editor, 'externalReservationEnabled'),
      prices: val(editor, 'pricesText').split(/\r?\n/).filter(Boolean).map((line, index) => { const [label, price, note] = line.split('|').map((item) => item.trim()); return { id: `price_${index}`, label, price, note }; }),
      benefitEnabled: checked(editor, 'benefitEnabled'), benefitTitle: val(editor, 'benefitTitle'), benefitContent: val(editor, 'benefitContent'), benefitConditions: val(editor, 'benefitConditions'), benefitNotes: val(editor, 'benefitNotes'), benefitExpiresAt: val(editor, 'benefitExpiresAt'), ...images,
    };
    await save({ action: 'save', page });
    document.getElementById('mainFile').value = '';
    document.getElementById('galleryFiles').value = '';
    for (const path of pendingDeletes) { try { await deleteObject(ref(storage, path)); } catch {} }
    pendingDeletes = [];
    status.textContent = '店舗情報を更新しました';
    await reload();
  } catch (error) {
    status.textContent = error?.message || '店舗情報を保存できませんでした。';
  } finally { button.disabled = false; }
};

async function reload() { const result = await load({}); data = result.data; options(); fill(); }
onAuthStateChanged(auth, async (user) => {
  if (!user) { status.textContent = '管理者としてログインしてください。'; location.href = './login.html'; return; }
  try { await reload(); status.textContent = '管理者認証済み'; } catch (error) { console.error('Store customer data load failed', error); status.textContent = '管理者権限または店舗情報を確認できませんでした。'; }
});
