export function escHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function fmtDateRu(d: Date): string {
  try {
    return d.toLocaleDateString('ru-RU');
  } catch {
    return String(d);
  }
}

export function planBtnLabel(plan: unknown): string {
  const p = plan as {
    name?: unknown;
    price?: unknown;
    currency?: unknown;
    periodDays?: unknown;
  } | null;
  // Короткая подпись для inline-кнопки (Telegram ограничивает длину)
  const name = String(p?.name ?? 'Тариф');
  const price = p?.price != null ? `${p.price}` : '?';
  const cur = String(p?.currency ?? '');
  const days = p?.periodDays != null ? `${p.periodDays}д` : '';
  return `${name} · ${price} ${cur} · ${days}`.trim();
}

/** Маскирует host сервера для безопасности (IP/домен). */
export function maskServerHost(host: string): string {
  // Если это IP адрес (содержит только цифры и точки)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const parts = host.split('.');
    // Показываем только первые две части, остальные заменяем на *
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  // Если это домен - показываем только первую часть
  const domainParts = host.split('.');
  if (domainParts.length > 2) {
    return `*.${domainParts.slice(-2).join('.')}`;
  }
  // Если короткий домен - показываем как есть или маскируем
  return host.length > 10 ? `${host.substring(0, 3)}***` : '***';
}

