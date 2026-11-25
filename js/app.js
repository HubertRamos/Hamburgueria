import {
  CATEGORIES,
  CATEGORY_ICONS,
  MEAT_POINTS,
  PRODUCTS,
  STORE_CONFIG,
} from './data.js';
import {
  CartStore,
  calculateUnitPrice,
  describeOptions,
  formatBRL,
  getDefaultOptions,
  getProductAddons,
} from './cart.js';
import {
  buildOrderMessage,
  buildWhatsappOrderUrl,
  getWhatsappBaseUrl,
  isWhatsappConfigured,
  validateCheckoutData,
} from './whatsapp.js';

const $ = (selector) => document.querySelector(selector);

const escapeHtml = (str) =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const cart = new CartStore();

const state = {
  category: 'all',
  quickFilter: 'all', // 'all' | 'promo' | 'popular'
  search: '',
  sort: 0, // 0 = padrão, 1 = menor preço, -1 = maior preço
  drawerView: 'cart', // 'cart' | 'checkout'
  lastFocusedBeforeModal: null,
  lastFocusedBeforeDrawer: null,
  checkout: {
    customerName: '',
    customerPhone: '',
    deliveryMethod: 'Entrega',
    street: '',
    number: '',
    neighborhood: '',
    complement: '',
    paymentMethod: 'PIX',
    changeFor: '',
    orderNotes: '',
  },
  checkoutErrors: {},
};

let toastTimer;
function showToast(message) {
  const el = $('#ts');
  if (!el) return;
  el.textContent = message;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2400);
}

function renderCategories() {
  const container = $('#cl');
  container.innerHTML = CATEGORIES.map(
    (cat) => `
      <button type="button" data-cat="${cat.id}" aria-pressed="${state.category === cat.id && !state.search}">
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          ${CATEGORY_ICONS[cat.id] || ''}
        </svg>
        ${escapeHtml(cat.label)}
      </button>
    `
  ).join('');
}

function renderQuickChips() {
  const chips = [
    { id: 'all', label: 'Todos os itens' },
    { id: 'promo', label: 'Promoções' },
    { id: 'popular', label: 'Mais pedidos' },
  ];
  $('#ch').innerHTML = chips
    .map(
      (chip) => `
        <button type="button" data-chip="${chip.id}" class="${state.quickFilter === chip.id ? 'on' : ''}" aria-pressed="${state.quickFilter === chip.id}">
          ${chip.label}
        </button>
      `
    )
    .join('');
}

function getFilteredProducts() {
  let list = PRODUCTS.filter((p) => p.available !== false);

  if (state.search) {
    const q = state.search.toLowerCase();
    list = list.filter((p) =>
      `${p.name} ${p.description} ${(p.ingredients || []).join(' ')}`
        .toLowerCase()
        .includes(q)
    );
  } else if (state.category !== 'all') {
    list = list.filter((p) => p.category === state.category);
  }

  if (state.quickFilter === 'promo') {
    list = list.filter((p) => p.badgeType === 'promo');
  } else if (state.quickFilter === 'popular') {
    list = list.filter((p) => p.badgeType === 'popular');
  }

  if (state.sort !== 0) {
    list = list.slice().sort((a, b) => (a.price - b.price) * state.sort);
  }

  return list;
}

function renderMenu() {
  document.querySelectorAll('[data-cat]').forEach((btn) => {
    const active = btn.dataset.cat === state.category && !state.search;
    btn.classList.toggle('on', active);
    btn.setAttribute('aria-pressed', String(active));
  });

  document.querySelectorAll('[data-chip]').forEach((btn) => {
    const active = btn.dataset.chip === state.quickFilter;
    btn.classList.toggle('on', active);
    btn.setAttribute('aria-pressed', String(active));
  });

  const sortBtn = $('#so');
  const sortLabel = $('#so-label');
  if (state.sort === 1) {
    sortBtn.classList.add('active');
    sortLabel.textContent = 'Menor preço';
  } else if (state.sort === -1) {
    sortBtn.classList.add('active');
    sortLabel.textContent = 'Maior preço';
  } else {
    sortBtn.classList.remove('active');
    sortLabel.textContent = 'Ordenar';
  }

  const clearBtn = $('#q-clear');
  if (clearBtn) {
    clearBtn.hidden = !state.search;
  }

  const items = getFilteredProducts();
  const countEl = $('#menu-count');
  if (countEl) {
    countEl.textContent = `${items.length} ${items.length === 1 ? 'item encontrado' : 'itens encontrados'}`;
  }

  const grid = $('#gr');
  if (!items.length) {
    grid.innerHTML = `
      <div class="ep" style="grid-column:1/-1">
        <p style="margin:0 0 12px">Nenhum produto encontrado para esses filtros.</p>
        <button type="button" class="btn btn-sec" id="reset-filters">Mostrar todo o cardápio</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = items
    .map(
      (p) => `
        <article class="cd">
          ${
            p.badge
              ? `<span class="tag ${p.badgeType === 'popular' ? 'popular' : ''}">${escapeHtml(p.badge)}</span>`
              : ''
          }
          <button type="button" class="im" data-open="${p.id}" aria-label="Personalizar ${escapeHtml(p.name)}">
            <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async">
          </button>
          <div class="cb">
            <div class="cb-head">
              <h3>
                <button type="button" class="cb-title-btn" data-open="${p.id}">
                  ${escapeHtml(p.name)}
                </button>
              </h3>
              <span class="cb-price">${formatBRL(p.price)}</span>
            </div>
            <p>${escapeHtml(p.description)}</p>
            <div class="cb-actions">
              <button type="button" class="btn btn-sec" data-open="${p.id}">Personalizar</button>
              <button type="button" class="btn" data-add="${p.id}">Adicionar</button>
            </div>
          </div>
        </article>
      `
    )
    .join('');
}

function openProductModal(productId, triggerEl = null) {
  const product = PRODUCTS.find((p) => p.id === productId);
  if (!product) return;

  state.lastFocusedBeforeModal = triggerEl || document.activeElement;
  const dialog = $('#pm');
  const addons = getProductAddons(product);
  const defaults = getDefaultOptions(product);
  let modalQty = 1;

  dialog.innerHTML = `
    <div style="position:relative">
      <div class="im">
        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
      </div>
      <button type="button" class="px" aria-label="Fechar janela" data-close-modal>×</button>
    </div>
    <div class="pb">
      <h3 id="pt">${escapeHtml(product.name)}</h3>
      <p class="pb-desc">${escapeHtml(product.description)}</p>

      ${
        product.flavors?.length
          ? `<h4>${escapeHtml(product.flavorLabel || 'Escolha a opção')}</h4>
             <div class="sz">
               ${product.flavors
                 .map(
                   (flavor, idx) => `
                     <label>
                       <input type="radio" name="pm-flavor" value="${escapeHtml(flavor)}" ${idx === 0 ? 'checked' : ''}>
                       <span>${escapeHtml(flavor)}</span>
                     </label>
                   `
                 )
                 .join('')}
             </div>`
          : ''
      }

      ${
        product.hasMeatPoint
          ? `<h4>Ponto da carne</h4>
             <input type="range" min="0" max="2" value="${defaults.meatPoint}" id="pm-point" aria-label="Ponto da carne">
             <div class="rg">${MEAT_POINTS.map((pt) => `<span>${pt}</span>`).join('')}</div>`
          : ''
      }

      ${
        product.sizes?.length
          ? `<h4>Tamanho</h4>
             <div class="sz">
               ${product.sizes
                 .map(
                   (sz, idx) => `
                     <label>
                       <input type="radio" name="pm-size" value="${sz.id}" ${idx === 0 ? 'checked' : ''}>
                       <span>${escapeHtml(sz.label)}${sz.extra > 0 ? ` +${formatBRL(sz.extra)}` : ''}</span>
                     </label>
                   `
                 )
                 .join('')}
             </div>`
          : ''
      }

      ${
        product.ingredients?.length
          ? `<h4>Ingredientes (desmarque para remover)</h4>
             ${product.ingredients
               .map(
                 (ing, idx) => `
                   <label class="sw">
                     <span>${escapeHtml(ing)}</span>
                     <input type="checkbox" checked data-ing-index="${idx}">
                   </label>
                 `
               )
               .join('')}`
          : ''
      }

      ${
        addons.length
          ? `<h4>Adicionais</h4>
             ${addons
               .map(
                 (addon) => `
                   <label class="sw">
                     <span>${escapeHtml(addon.name)}</span>
                     <span class="sw-price">+ ${formatBRL(addon.price)}</span>
                     <input type="checkbox" data-addon-id="${escapeHtml(addon.id)}">
                   </label>
                 `
               )
               .join('')}`
          : ''
      }

      <h4>Observações especiais</h4>
      <textarea class="pm-notes" id="pm-notes" maxlength="140" placeholder="Ex.: molho à parte, bem embalado, cortar ao meio..."></textarea>

      <div class="pm-footer">
        <div class="pm-qty" aria-label="Quantidade">
          <button type="button" id="pm-dec" aria-label="Diminuir quantidade">−</button>
          <span id="pm-qty-val">1</span>
          <button type="button" id="pm-inc" aria-label="Aumentar quantidade">+</button>
        </div>
        <button type="button" class="btn" id="pm-add-btn">Adicionar • ${formatBRL(product.price)}</button>
      </div>
    </div>
  `;

  const collectOptions = () => {
    const removed = [...dialog.querySelectorAll('[data-ing-index]')]
      .filter((input) => !input.checked)
      .map((input) => product.ingredients[Number(input.dataset.ingIndex)]);

    const meatInput = dialog.querySelector('#pm-point');
    const meatPoint = product.hasMeatPoint && meatInput ? Number(meatInput.value) : -1;

    const sizeInput = dialog.querySelector('[name="pm-size"]:checked');
    const sizeId = sizeInput ? sizeInput.value : '';

    const flavorInput = dialog.querySelector('[name="pm-flavor"]:checked');
    const flavor = flavorInput ? flavorInput.value : '';

    const addonIds = [...dialog.querySelectorAll('[data-addon-id]:checked')].map(
      (input) => input.dataset.addonId
    );
    const selectedAddons = addons.filter((a) => addonIds.includes(a.id));

    const notes = dialog.querySelector('#pm-notes')?.value || '';

    return { removed, meatPoint, sizeId, flavor, addons: selectedAddons, notes };
  };

  const updateModalPrice = () => {
    const opts = collectOptions();
    const unit = calculateUnitPrice(product, opts);
    $('#pm-qty-val').textContent = String(modalQty);
    $('#pm-add-btn').textContent = `Adicionar • ${formatBRL(unit * modalQty)}`;
  };

  dialog.onchange = updateModalPrice;
  dialog.oninput = (e) => {
    if (e.target.id === 'pm-point') updateModalPrice();
  };

  dialog.onclick = (e) => {
    if (e.target === dialog || e.target.closest('[data-close-modal]')) {
      dialog.close();
      return;
    }
    if (e.target.id === 'pm-dec') {
      modalQty = Math.max(1, modalQty - 1);
      updateModalPrice();
    } else if (e.target.id === 'pm-inc') {
      modalQty = Math.min(99, modalQty + 1);
      updateModalPrice();
    } else if (e.target.id === 'pm-add-btn') {
      const opts = collectOptions();
      cart.addItem(product, opts, modalQty);
      dialog.close();
      updateCartUI();
      showToast(`${modalQty}x ${product.name} no carrinho`);
    }
  };

  dialog.showModal();
}

function updateHeaderAndMenuCTA() {
  const count = cart.getTotalCount();
  $('#cn').textContent = count || '';

  const bottomCta = $('#pa');
  if (bottomCta) {
    if (count > 0) {
      bottomCta.textContent = `Ver carrinho e finalizar (${count})`;
      bottomCta.dataset.action = 'open-cart';
    } else {
      bottomCta.textContent = 'Explorar categorias do cardápio';
      bottomCta.dataset.action = 'scroll-menu';
    }
  }
}

function renderCartDrawer() {
  const count = cart.getTotalCount();
  const total = cart.getTotalAmount();
  const clearBtn = $('#cd-clear');
  const titleEl = $('#cd-title');
  const bodyEl = $('#cd-body');
  const footerEl = $('#cd-footer');

  if (clearBtn) {
    clearBtn.hidden = !(count > 0 && state.drawerView === 'cart');
  }

  if (state.drawerView === 'checkout' && count === 0) {
    state.drawerView = 'cart';
  }

  if (state.drawerView === 'cart') {
    titleEl.textContent = count ? `Meu carrinho (${count})` : 'Meu carrinho';

    if (!count) {
      bodyEl.innerHTML = `
        <div class="ep">
          <p style="margin:0 0 14px">Seu carrinho está vazio. Escolha um hambúrguer ou combo no cardápio.</p>
          <button type="button" class="btn" id="cd-browse">Ver cardápio</button>
        </div>
      `;
    } else {
      bodyEl.innerHTML = cart.items
        .map((item, idx) => {
          const details = describeOptions(item.product, item.options);
          const subtotal = item.unitPrice * item.quantity;
          return `
            <div class="li">
              <div class="li-title">${escapeHtml(item.product.name)}</div>
              <div class="li-meta">
                ${details.length ? escapeHtml(details.join(' · ')) : 'Padrão da casa'}
                ${item.quantity > 1 ? ` · ${formatBRL(item.unitPrice)} cada` : ''}
                ${item.options.notes ? `<div class="li-note">Obs.: ${escapeHtml(item.options.notes)}</div>` : ''}
              </div>
              <div class="li-price">${formatBRL(subtotal)}</div>
              <div class="q">
                <button type="button" data-cart-dec="${idx}" aria-label="Diminuir ${escapeHtml(item.product.name)}">−</button>
                <span>${item.quantity}</span>
                <button type="button" data-cart-inc="${idx}" aria-label="Aumentar ${escapeHtml(item.product.name)}">+</button>
              </div>
            </div>
          `;
        })
        .join('');
    }

    footerEl.innerHTML = `
      <div class="tt"><span>Total</span><span>${formatBRL(total)}</span></div>
      <button type="button" class="btn" id="cd-go-checkout" ${count ? '' : 'disabled'}>
        Continuar para entrega e pagamento
      </button>
    `;
    return;
  }

  // Checkout View
  titleEl.textContent = 'Finalizar pedido';
  const c = state.checkout;
  const e = state.checkoutErrors;
  const waReady = isWhatsappConfigured();

  bodyEl.innerHTML = `
    <button type="button" class="co-back" id="co-back">← Voltar aos itens</button>

    <div class="co-summary">
      <strong>Resumo: ${count} ${count === 1 ? 'item' : 'itens'} • Total ${formatBRL(total)}</strong>
      <span>${cart.items.map((i) => `${i.quantity}x ${escapeHtml(i.product.name)}`).join(', ')}</span>
    </div>

    ${
      !waReady
        ? `<div class="co-notice" role="status">
             <strong>WhatsApp da loja pendente de configuração:</strong> você pode preencher seus dados abaixo e copiar o resumo formatado do pedido para enviar manualmente.
           </div>`
        : ''
    }

    <form id="co-form" novalidate>
      <div class="co-field">
        <label for="co-name">Nome completo *</label>
        <input id="co-name" name="customerName" type="text" required autocomplete="name" value="${escapeHtml(c.customerName)}" class="${e.customerName ? 'invalid' : ''}" placeholder="Seu nome">
        ${e.customerName ? `<span class="co-err">${escapeHtml(e.customerName)}</span>` : ''}
      </div>

      <div class="co-field">
        <label for="co-phone">Seu WhatsApp / Telefone (opcional)</label>
        <input id="co-phone" name="customerPhone" type="tel" autocomplete="tel" value="${escapeHtml(c.customerPhone)}" class="${e.customerPhone ? 'invalid' : ''}" placeholder="(00) 00000-0000">
        ${e.customerPhone ? `<span class="co-err">${escapeHtml(e.customerPhone)}</span>` : ''}
      </div>

      <div class="seg" role="radiogroup" aria-label="Forma de recebimento">
        <label>
          <input type="radio" name="deliveryMethod" value="Entrega" ${c.deliveryMethod === 'Entrega' ? 'checked' : ''}>
          <span>Entrega</span>
        </label>
        <label>
          <input type="radio" name="deliveryMethod" value="Retirada" ${c.deliveryMethod === 'Retirada' ? 'checked' : ''}>
          <span>Retirada</span>
        </label>
      </div>

      ${
        c.deliveryMethod === 'Entrega'
          ? `
            <div class="co-grid2">
              <div class="co-field">
                <label for="co-street">Rua / Avenida *</label>
                <input id="co-street" name="street" type="text" required autocomplete="street-address" value="${escapeHtml(c.street)}" class="${e.street ? 'invalid' : ''}" placeholder="Ex.: Rua das Palmeiras">
                ${e.street ? `<span class="co-err">${escapeHtml(e.street)}</span>` : ''}
              </div>
              <div class="co-field">
                <label for="co-number">Número *</label>
                <input id="co-number" name="number" type="text" required value="${escapeHtml(c.number)}" class="${e.number ? 'invalid' : ''}" placeholder="Ex.: 227">
                ${e.number ? `<span class="co-err">${escapeHtml(e.number)}</span>` : ''}
              </div>
            </div>
            <div class="co-field">
              <label for="co-neighborhood">Bairro *</label>
              <input id="co-neighborhood" name="neighborhood" type="text" required value="${escapeHtml(c.neighborhood)}" class="${e.neighborhood ? 'invalid' : ''}" placeholder="Seu bairro">
              ${e.neighborhood ? `<span class="co-err">${escapeHtml(e.neighborhood)}</span>` : ''}
            </div>
            <div class="co-field">
              <label for="co-complement">Complemento / Referência</label>
              <input id="co-complement" name="complement" type="text" value="${escapeHtml(c.complement)}" placeholder="Apto, bloco, portão...">
            </div>
          `
          : ''
      }

      <div class="co-field">
        <label>Forma de pagamento</label>
        <div class="pg" role="radiogroup" aria-label="Pagamento">
          ${['PIX', 'Cartão', 'Dinheiro']
            .map(
              (method) => `
                <label>
                  <input type="radio" name="paymentMethod" value="${method}" ${c.paymentMethod === method ? 'checked' : ''}>
                  <span>${method}</span>
                </label>
              `
            )
            .join('')}
        </div>
      </div>

      ${
        c.paymentMethod === 'Dinheiro'
          ? `
            <div class="co-field">
              <label for="co-change">Troco para quanto? (opcional)</label>
              <input id="co-change" name="changeFor" type="text" value="${escapeHtml(c.changeFor)}" placeholder="Ex.: R$ 50,00 ou Não precisa">
            </div>
          `
          : ''
      }

      <div class="co-field">
        <label for="co-notes">Observações gerais do pedido</label>
        <textarea id="co-notes" name="orderNotes" rows="2" maxlength="200" placeholder="Ex.: campainha não funciona, enviar guardanapos...">${escapeHtml(c.orderNotes)}</textarea>
      </div>
    </form>
  `;

  footerEl.innerHTML = `
    <div class="tt"><span>Total</span><span>${formatBRL(total)}</span></div>
    <div class="cf-stack">
      ${
        waReady
          ? `<button type="button" class="btn" id="co-send-wa">Enviar pedido pelo WhatsApp</button>`
          : ''
      }
      <button type="button" class="btn ${waReady ? 'btn-outline' : ''}" id="co-copy">
        Copiar resumo do pedido
      </button>
    </div>
  `;
}

function updateCartUI() {
  updateHeaderAndMenuCTA();
  renderCartDrawer();
}

function openCartDrawer(view = 'cart', triggerEl = null) {
  state.lastFocusedBeforeDrawer = triggerEl || document.activeElement;
  state.drawerView = view;
  updateCartUI();
  const drawer = $('#cd');
  if (!drawer.open) drawer.showModal();
}

function syncStoreContactLinks() {
  const waReady = isWhatsappConfigured();
  const baseUrl = getWhatsappBaseUrl();
  ['#wl', '#wl2'].forEach((selector) => {
    const el = $(selector);
    if (!el) return;
    if (waReady) {
      el.href = baseUrl;
      el.target = '_blank';
      el.rel = 'noopener';
    } else {
      el.href = '#contato';
      el.removeAttribute('target');
      el.removeAttribute('rel');
      if (selector === '#wl') {
        el.textContent = 'WhatsApp (número pendente de configuração)';
      }
    }
  });

  const hoursEl = $('#info-hours');
  if (hoursEl) {
    hoursEl.innerHTML = STORE_CONFIG.hours.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
  }
  const addrEl = $('#info-address');
  if (addrEl) {
    addrEl.innerHTML = `<p>${STORE_CONFIG.addressLines.map((line) => escapeHtml(line)).join('<br>')}</p>`;
  }
  const emailEl = $('#info-email');
  if (emailEl) {
    emailEl.textContent = STORE_CONFIG.email;
  }
}

async function copyOrderSummary(message) {
  try {
    await navigator.clipboard.writeText(message);
    showToast('Resumo do pedido copiado!');
  } catch {
    showToast('Não foi possível copiar automaticamente.');
  }
}

function submitCheckout(mode) {
  const errors = validateCheckoutData(state.checkout);
  state.checkoutErrors = errors;

  if (Object.keys(errors).length > 0) {
    renderCartDrawer();
    const firstInvalid = $('#cd .invalid');
    if (firstInvalid) firstInvalid.focus();
    showToast('Verifique os campos obrigatórios.');
    return;
  }

  const message = buildOrderMessage(cart.items, cart.getTotalAmount(), state.checkout);

  if (mode === 'whatsapp' && isWhatsappConfigured()) {
    const url = buildWhatsappOrderUrl(message);
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('Abrindo WhatsApp com seu pedido...');
  } else {
    copyOrderSummary(message);
  }
}

function bindEvents() {
  // Mobile menu toggle
  const menuBtn = $('#mb');
  const mobileNav = $('#nav');
  menuBtn.addEventListener('click', () => {
    const expanded = mobileNav.classList.toggle('on');
    menuBtn.setAttribute('aria-expanded', String(expanded));
  });
  mobileNav.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') {
      mobileNav.classList.remove('on');
      menuBtn.setAttribute('aria-expanded', 'false');
    }
  });

  // Category strip
  $('#cl').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    state.category = btn.dataset.cat;
    state.search = '';
    $('#q').value = '';
    renderMenu();
    $('#cardapio').scrollIntoView({ behavior: 'smooth' });
  });

  // Quick filter chips
  $('#ch').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-chip]');
    if (!btn) return;
    state.quickFilter = btn.dataset.chip;
    renderMenu();
  });

  // Search
  $('#q').addEventListener('input', (e) => {
    state.search = e.target.value.trim();
    renderMenu();
  });

  $('#q-clear').addEventListener('click', () => {
    state.search = '';
    $('#q').value = '';
    $('#q').focus();
    renderMenu();
  });

  // Price sort
  $('#so').addEventListener('click', () => {
    state.sort = state.sort === 0 ? 1 : state.sort === 1 ? -1 : 0;
    const msg =
      state.sort === 1
        ? 'Ordenado por menor preço'
        : state.sort === -1
        ? 'Ordenado por maior preço'
        : 'Ordem padrão do cardápio';
    showToast(msg);
    renderMenu();
  });

  // Menu grid actions
  $('#gr').addEventListener('click', (e) => {
    if (e.target.id === 'reset-filters') {
      state.category = 'all';
      state.quickFilter = 'all';
      state.search = '';
      state.sort = 0;
      $('#q').value = '';
      renderMenu();
      return;
    }

    const openTrigger = e.target.closest('[data-open]');
    if (openTrigger) {
      openProductModal(Number(openTrigger.dataset.open), openTrigger);
      return;
    }

    const addTrigger = e.target.closest('[data-add]');
    if (addTrigger) {
      const product = PRODUCTS.find((p) => p.id === Number(addTrigger.dataset.add));
      if (!product) return;
      cart.addItem(product, getDefaultOptions(product), 1);
      updateCartUI();
      showToast(`${product.name} adicionado ao carrinho`);
    }
  });

  // Bottom menu CTA
  $('#pa').addEventListener('click', (e) => {
    if (e.currentTarget.dataset.action === 'open-cart') {
      openCartDrawer('cart', e.currentTarget);
    } else {
      $('#categorias').scrollIntoView({ behavior: 'smooth' });
    }
  });

  // Header cart button
  $('#oc').addEventListener('click', (e) => openCartDrawer('cart', e.currentTarget));

  // Drawer interactions
  const drawer = $('#cd');
  $('#cd-close').addEventListener('click', () => drawer.close());
  $('#cd-clear').addEventListener('click', () => {
    cart.clear();
    state.drawerView = 'cart';
    updateCartUI();
    showToast('Carrinho esvaziado');
  });

  drawer.addEventListener('click', (e) => {
    if (e.target === drawer) {
      drawer.close();
      return;
    }
    if (e.target.id === 'cd-browse') {
      drawer.close();
      $('#cardapio').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (e.target.id === 'cd-go-checkout') {
      state.drawerView = 'checkout';
      renderCartDrawer();
      return;
    }
    if (e.target.id === 'co-back') {
      state.drawerView = 'cart';
      renderCartDrawer();
      return;
    }
    if (e.target.id === 'co-send-wa') {
      submitCheckout('whatsapp');
      return;
    }
    if (e.target.id === 'co-copy') {
      submitCheckout('copy');
      return;
    }

    const dec = e.target.closest('[data-cart-dec]');
    if (dec) {
      cart.decrement(Number(dec.dataset.cartDec));
      updateCartUI();
      return;
    }
    const inc = e.target.closest('[data-cart-inc]');
    if (inc) {
      cart.increment(Number(inc.dataset.cartInc));
      updateCartUI();
    }
  });

  // Sync checkout inputs without losing focus while typing
  drawer.addEventListener('input', (e) => {
    const field = e.target.name;
    if (!field || !(field in state.checkout)) return;
    state.checkout[field] = e.target.value;
    if (state.checkoutErrors[field]) {
      delete state.checkoutErrors[field];
      e.target.classList.remove('invalid');
      const errSpan = e.target.parentElement?.querySelector('.co-err');
      if (errSpan) errSpan.remove();
    }
  });

  drawer.addEventListener('change', (e) => {
    const field = e.target.name;
    if (field === 'deliveryMethod' || field === 'paymentMethod') {
      state.checkout[field] = e.target.value;
      renderCartDrawer();
    }
  });

  // Restore focus on dialog close
  $('#pm').addEventListener('close', () => {
    if (state.lastFocusedBeforeModal?.focus) {
      state.lastFocusedBeforeModal.focus();
    }
  });
  drawer.addEventListener('close', () => {
    if (state.lastFocusedBeforeDrawer?.focus) {
      state.lastFocusedBeforeDrawer.focus();
    }
  });

  // Unconfigured WhatsApp links toast
  ['#wl', '#wl2'].forEach((selector) => {
    const link = $(selector);
    if (!link) return;
    link.addEventListener('click', (e) => {
      if (!isWhatsappConfigured()) {
        e.preventDefault();
        showToast('Número de WhatsApp da loja ainda não configurado.');
      }
    });
  });
}

function init() {
  renderCategories();
  renderQuickChips();
  renderMenu();
  syncStoreContactLinks();
  updateCartUI();
  bindEvents();
}

init();
