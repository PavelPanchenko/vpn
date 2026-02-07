import { normalizeCurrency as normalizeCurrencyBase } from '../../common/currencies';

// Re-export for backward compatibility внутри plans модуля
export const normalizeCurrency = normalizeCurrencyBase;

export function defaultProviderForCurrency(currency: string | null | undefined): string {
  const c = normalizeCurrency(currency);
  if (c === 'XTR') return 'TELEGRAM_STARS';
  if (c === 'USD' || c === 'UAH' || c === 'EUR') return 'CRYPTOCLOUD';
  return 'PLATEGA';
}

export function defaultVariantCode(planCode: string | null | undefined, currency: string | null | undefined): string {
  const pc = String(planCode ?? '').trim();
  const c = normalizeCurrency(currency);
  if (!pc || !c) return '';
  if (c === 'XTR') return `${pc}_stars`;
  // UX: показываем как USDT, но в БД валюта USD
  if (c === 'USD') return `${pc}_usdt`;
  return `${pc}_${c.toLowerCase()}`;
}

