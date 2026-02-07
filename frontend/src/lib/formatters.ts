export function formatTraffic(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatPrice(price: number, currency: string): string {
  const c = String(currency ?? '').toUpperCase();
  if (c === 'RUB') return `${price} ₽`;
  if (c === 'UAH') return `${price} ₴`;
  if (c === 'USD') return `${price} $`;
  if (c === 'EUR') return `${price} €`;
  if (c === 'GBP') return `${price} £`;
  if (c === 'XTR') return `${price} ⭐`;
  if (c === 'USDT') return `${price} USDT`;
  return `${price} ${c}`;
}

