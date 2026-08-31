(function () {
  'use strict';
  const products = window.NOX_SELECT_PRODUCTS || [];
  const grid = document.querySelector('[data-product-grid]');
  const filters = document.querySelector('[data-filters]');
  const count = document.querySelector('[data-product-count]');
  const modal = document.querySelector('[data-product-modal]');
  const filterNames = ['ALL', ...new Set(products.flatMap(product => product.categories))];
  let activeFilter = 'ALL';
  let activeProduct = null;
  let activeImage = 0;

  const yen = price => `¥${price.toLocaleString('ja-JP')}`;
  const imageMarkup = product => `<img src="${product.images[0]}" alt="${product.jp} ネイルチップ" width="900" height="900" loading="lazy" decoding="async">`;

  function cardMarkup(product, pickup) {
    return `<article class="product-card${pickup ? ' pickup-card' : ''}" data-product-id="${product.id}">
      <button class="card-open" type="button" aria-label="${product.name}の詳細を見る">
        <span class="product-image">${imageMarkup(product)}<span class="card-number">#${product.id}</span></span>
        <span class="card-body"><small>NOX SELECT NAIL</small><strong>${product.name}</strong><span class="jp-name">${product.jp}</span><b>${yen(product.price)}</b><span class="detail-link">詳しく見る <i aria-hidden="true">→</i></span></span>
      </button>
    </article>`;
  }

  function renderProducts() {
    const visible = activeFilter === 'ALL' ? products : products.filter(product => product.categories.includes(activeFilter));
    grid.innerHTML = visible.map(product => cardMarkup(product, false)).join('');
    count.textContent = `${visible.length} ITEMS`;
  }

  filters.innerHTML = filterNames.map((name, index) => `<button type="button" data-filter="${name}" aria-pressed="${index === 0}">${name}</button>`).join('');
  filters.addEventListener('click', event => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    activeFilter = button.dataset.filter;
    filters.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    renderProducts();
  });

  const pickupTrack = document.querySelector('[data-pickup-track]');
  pickupTrack.innerHTML = products.filter(product => product.pickup).map(product => cardMarkup(product, true)).join('');
  document.querySelector('[data-pickup-prev]').addEventListener('click', () => pickupTrack.scrollBy({left: -pickupTrack.clientWidth * .75, behavior: 'smooth'}));
  document.querySelector('[data-pickup-next]').addEventListener('click', () => pickupTrack.scrollBy({left: pickupTrack.clientWidth * .75, behavior: 'smooth'}));

  function updateGallery() {
    const image = modal.querySelector('[data-modal-image]');
    image.src = activeProduct.images[activeImage];
    image.alt = `${activeProduct.jp} 商品画像 ${activeImage + 1}`;
    modal.querySelector('[data-image-count]').textContent = `${activeImage + 1} / ${activeProduct.images.length}`;
    modal.querySelectorAll('.gallery-arrow').forEach(button => button.hidden = activeProduct.images.length < 2);
  }

  function openProduct(id) {
    activeProduct = products.find(product => product.id === id);
    if (!activeProduct) return;
    activeImage = 0;
    modal.querySelector('[data-modal-title]').textContent = activeProduct.name;
    modal.querySelector('[data-modal-catch]').textContent = `「${activeProduct.catch}」`;
    modal.querySelector('[data-modal-description]').textContent = activeProduct.description;
    modal.querySelector('[data-modal-price]').textContent = yen(activeProduct.price);
    modal.querySelector('[data-modal-buy]').href = activeProduct.url;
    modal.querySelector('[data-modal-tags]').innerHTML = activeProduct.tags.map(tag => `<span>${tag}</span>`).join('');
    updateGallery();
    modal.showModal();
    document.body.classList.add('modal-open');
  }

  document.addEventListener('click', event => {
    const card = event.target.closest('[data-product-id]');
    if (card) openProduct(card.dataset.productId);
  });
  modal.querySelector('[data-modal-close]').addEventListener('click', () => modal.close());
  modal.addEventListener('click', event => { if (event.target === modal) modal.close(); });
  modal.addEventListener('close', () => document.body.classList.remove('modal-open'));
  modal.querySelector('[data-gallery-prev]').addEventListener('click', () => { activeImage = (activeImage - 1 + activeProduct.images.length) % activeProduct.images.length; updateGallery(); });
  modal.querySelector('[data-gallery-next]').addEventListener('click', () => { activeImage = (activeImage + 1) % activeProduct.images.length; updateGallery(); });

  let touchStart = 0;
  modal.querySelector('.modal-gallery').addEventListener('touchstart', event => { touchStart = event.changedTouches[0].clientX; }, {passive:true});
  modal.querySelector('.modal-gallery').addEventListener('touchend', event => {
    if (!activeProduct || activeProduct.images.length < 2) return;
    const delta = event.changedTouches[0].clientX - touchStart;
    if (Math.abs(delta) > 45) { activeImage = (activeImage + (delta < 0 ? 1 : -1) + activeProduct.images.length) % activeProduct.images.length; updateGallery(); }
  }, {passive:true});

  const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } }), {threshold:.08});
  document.querySelectorAll('.reveal').forEach(element => observer.observe(element));
  renderProducts();
})();
