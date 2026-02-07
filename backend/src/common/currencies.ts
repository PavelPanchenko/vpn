export const CURRENCY_CODES = [
  // fiat (CryptoCloud invoice currency list, + запас)
  'USD',
  'UAH',
  'EUR',
  'GBP',
  'RUB',
  'KZT',
  'UZS',
  'KGS',
  'AMD',
  'AZN',
  'BYN',
  'AUD',
  'TRY',
  'AED',
  'CAD',
  'CNY',
  'HKD',
  'IDR',
  'INR',
  'JPY',
  'PHP',
  'SGD',
  'THB',
  'VND',
  'MYR',
  // internal Telegram currency
  'XTR',
] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export function normalizeCurrency(currency: string | null | undefined): string {
  return String(currency ?? '').trim().toUpperCase();
}

