import { STORE_CONFIG } from './data.js';
import { describeOptions, formatBRL } from './cart.js';

export function isWhatsappConfigured() {
  const digits = String(STORE_CONFIG.whatsappNumber || '').replace(/\D/g, '');
  return digits.length >= 10 && !/^0+$/.test(digits) && digits !== '5500000000000';
}

export function getWhatsappBaseUrl() {
  if (!isWhatsappConfigured()) return '';
  const digits = String(STORE_CONFIG.whatsappNumber).replace(/\D/g, '');
  return `https://wa.me/${digits}`;
}

export function validateCheckoutData(formData) {
  const errors = {};

  if (!formData.customerName.trim() || formData.customerName.trim().length < 2) {
    errors.customerName = 'Informe seu nome para identificar o pedido.';
  }

  if (formData.customerPhone.trim()) {
    const phoneDigits = formData.customerPhone.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      errors.customerPhone = 'Informe um telefone com DDD (10 ou 11 dígitos).';
    }
  }

  if (formData.deliveryMethod === 'Entrega') {
    if (!formData.street.trim()) {
      errors.street = 'Informe a rua ou avenida para entrega.';
    }
    if (!formData.number.trim()) {
      errors.number = 'Informe o número.';
    }
    if (!formData.neighborhood.trim()) {
      errors.neighborhood = 'Informe o bairro.';
    }
  }

  return errors;
}

export function buildOrderMessage(items, totalAmount, formData) {
  const lines = [
    `*Novo Pedido — ${STORE_CONFIG.brandName}*`,
    '',
    '*Itens do pedido:*',
  ];

  items.forEach((item, idx) => {
    const details = describeOptions(item.product, item.options);
    const subtotal = formatBRL(item.unitPrice * item.quantity);
    lines.push(
      `${idx + 1}. ${item.quantity}x ${item.product.name} — ${subtotal}`
    );
    if (details.length) {
      lines.push(`   • ${details.join(' · ')}`);
    }
    if (item.options.notes) {
      lines.push(`   • Obs.: ${item.options.notes}`);
    }
  });

  lines.push('');
  lines.push(`*Total: ${formatBRL(totalAmount)}*`);
  lines.push('');
  lines.push(`*Cliente:* ${formData.customerName.trim()}`);
  if (formData.customerPhone.trim()) {
    lines.push(`*Contato:* ${formData.customerPhone.trim()}`);
  }

  lines.push(`*Recebimento:* ${formData.deliveryMethod}`);
  if (formData.deliveryMethod === 'Entrega') {
    const addrParts = [
      `${formData.street.trim()}, ${formData.number.trim()}`,
      formData.neighborhood.trim(),
    ];
    if (formData.complement.trim()) {
      addrParts.push(formData.complement.trim());
    }
    lines.push(`*Endereço:* ${addrParts.join(' — ')}`);
  }

  lines.push(`*Pagamento:* ${formData.paymentMethod}`);
  if (formData.paymentMethod === 'Dinheiro' && formData.changeFor.trim()) {
    lines.push(`*Troco para:* ${formData.changeFor.trim()}`);
  }

  if (formData.orderNotes.trim()) {
    lines.push(`*Observações gerais:* ${formData.orderNotes.trim()}`);
  }

  return lines.join('\n');
}

export function buildWhatsappOrderUrl(message) {
  const base = getWhatsappBaseUrl();
  if (!base) return '';
  return `${base}?text=${encodeURIComponent(message)}`;
}
