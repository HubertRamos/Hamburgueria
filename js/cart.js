import { ADDONS_BY_CATEGORY, MEAT_POINTS, PRODUCTS } from './data.js';

const STORAGE_KEY = 'burguer-do-hubert:cart:v1';

export const formatBRL = (value) =>
  'R$ ' + Number(value || 0).toFixed(2).replace('.', ',');

export function getProductAddons(product) {
  return ADDONS_BY_CATEGORY[product.category] || [];
}

export function getDefaultOptions(product) {
  return {
    removed: [],
    meatPoint: product.hasMeatPoint ? 1 : -1,
    sizeId: product.sizes?.length ? product.sizes[0].id : '',
    flavor: product.flavors?.length ? product.flavors[0] : '',
    addons: [],
    notes: '',
  };
}

export function normalizeOptions(product, rawOptions = {}) {
  const defaults = getDefaultOptions(product);
  const validIngredients = new Set(product.ingredients || []);
  const removed = Array.isArray(rawOptions.removed)
    ? [...new Set(rawOptions.removed.filter((item) => validIngredients.has(item)))]
    : defaults.removed;

  const meatPoint = product.hasMeatPoint
    ? Math.min(Math.max(Number(rawOptions.meatPoint ?? defaults.meatPoint), 0), MEAT_POINTS.length - 1)
    : -1;

  const validSizes = product.sizes || [];
  const matchedSize = validSizes.find((s) => s.id === rawOptions.sizeId);
  const sizeId = validSizes.length ? (matchedSize ? matchedSize.id : validSizes[0].id) : '';

  const validFlavors = product.flavors || [];
  const flavor = validFlavors.length
    ? (validFlavors.includes(rawOptions.flavor) ? rawOptions.flavor : validFlavors[0])
    : '';

  const availableAddons = getProductAddons(product);
  const rawAddonIds = Array.isArray(rawOptions.addons)
    ? rawOptions.addons.map((a) => (typeof a === 'string' ? a : a?.id))
    : [];
  const addonIdSet = new Set(rawAddonIds);
  const addons = availableAddons.filter((a) => addonIdSet.has(a.id));

  const notes = typeof rawOptions.notes === 'string'
    ? rawOptions.notes.trim().slice(0, 140)
    : '';

  return { removed, meatPoint, sizeId, flavor, addons, notes };
}

export function calculateUnitPrice(product, options) {
  const sizeObj = (product.sizes || []).find((s) => s.id === options.sizeId);
  const sizeExtra = sizeObj ? sizeObj.extra : 0;
  const addonsTotal = (options.addons || []).reduce((sum, a) => sum + a.price, 0);
  return Number((product.price + sizeExtra + addonsTotal).toFixed(2));
}

export function buildCartKey(productId, options) {
  return JSON.stringify({
    id: productId,
    removed: [...options.removed].sort(),
    meatPoint: options.meatPoint,
    sizeId: options.sizeId,
    flavor: options.flavor,
    addons: options.addons.map((a) => a.id).sort(),
    notes: options.notes,
  });
}

export function describeOptions(product, options) {
  const parts = [];
  if (options.flavor) {
    parts.push(options.flavor);
  }
  if (product.hasMeatPoint && options.meatPoint >= 0) {
    parts.push(MEAT_POINTS[options.meatPoint]);
  }
  if (options.sizeId && product.sizes?.length) {
    const sizeObj = product.sizes.find((s) => s.id === options.sizeId);
    if (sizeObj) parts.push(sizeObj.label);
  }
  if (options.removed.length) {
    parts.push(`sem ${options.removed.join(', ')}`);
  }
  if (options.addons.length) {
    parts.push(`+ ${options.addons.map((a) => a.name).join(', ')}`);
  }
  return parts;
}

export class CartStore {
  constructor() {
    this.items = this.#load();
  }

  #load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const productMap = new Map(PRODUCTS.map((p) => [p.id, p]));
      const hydrated = [];
      for (const entry of parsed) {
        const product = productMap.get(entry?.productId);
        const qty = Number(entry?.quantity);
        if (!product || !Number.isInteger(qty) || qty < 1) continue;
        const options = normalizeOptions(product, entry.options);
        hydrated.push({
          key: buildCartKey(product.id, options),
          product,
          options,
          unitPrice: calculateUnitPrice(product, options),
          quantity: qty,
        });
      }
      return hydrated;
    } catch {
      return [];
    }
  }

  #save() {
    try {
      const serializable = this.items.map((item) => ({
        productId: item.product.id,
        options: {
          ...item.options,
          addons: item.options.addons.map((a) => a.id),
        },
        quantity: item.quantity,
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch {
      // Ignora erro caso armazenamento local esteja indisponível
    }
  }

  addItem(product, rawOptions, quantity = 1) {
    const options = normalizeOptions(product, rawOptions);
    const key = buildCartKey(product.id, options);
    const qty = Math.max(1, Math.min(99, Number(quantity) || 1));
    const existing = this.items.find((item) => item.key === key);

    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + qty);
    } else {
      this.items.push({
        key,
        product,
        options,
        unitPrice: calculateUnitPrice(product, options),
        quantity: qty,
      });
    }
    this.#save();
  }

  increment(index) {
    const item = this.items[index];
    if (!item) return;
    item.quantity = Math.min(99, item.quantity + 1);
    this.#save();
  }

  decrement(index) {
    const item = this.items[index];
    if (!item) return;
    if (item.quantity <= 1) {
      this.items.splice(index, 1);
    } else {
      item.quantity -= 1;
    }
    this.#save();
  }

  remove(index) {
    if (index < 0 || index >= this.items.length) return;
    this.items.splice(index, 1);
    this.#save();
  }

  clear() {
    this.items = [];
    this.#save();
  }

  getTotalCount() {
    return this.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  getTotalAmount() {
    return Number(
      this.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0).toFixed(2)
    );
  }
}
