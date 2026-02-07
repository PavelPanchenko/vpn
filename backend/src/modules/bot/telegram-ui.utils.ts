export function escHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function fmtDateByLang(lang: 'ru' | 'en' | 'uk', d: Date): string {
  try {
    const locale = lang === 'en' ? 'en-GB' : lang === 'uk' ? 'uk-UA' : 'ru-RU';
    return d.toLocaleDateString(locale);
  } catch {
    return String(d);
  }
}

export function planBtnLabel(plan: unknown): string {
  const p = plan as {
    name?: unknown;
    periodDays?: unknown;
    variants?: Array<{ price?: unknown; currency?: unknown }>;
  } | null;
  // Короткая подпись для inline-кнопки (Telegram ограничивает длину)
  const name = String(p?.name ?? 'Тариф');
  const variants = Array.isArray(p?.variants) ? p?.variants : [];
  const prices =
    variants.length > 0
      ? variants
          .map((v) => `${String(v?.price ?? '?')} ${String(v?.currency ?? '')}`.trim())
          .filter(Boolean)
          .slice(0, 2)
          .join(' | ')
      : '?';
  const days = p?.periodDays != null ? `${p.periodDays}д` : '';
  return `${name} · ${prices} · ${days}`.trim();
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

