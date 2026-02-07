import type { CurrencyCode } from '../../../common/currencies';

export type PaymentProviderKey = 'TELEGRAM_STARS' | 'PLATEGA' | 'CRYPTOCLOUD';

export const PROVIDER_SUPPORTED_CURRENCIES: Record<PaymentProviderKey, ReadonlyArray<CurrencyCode>> = {
  TELEGRAM_STARS: ['XTR'],
  PLATEGA: ['RUB'],
  // CryptoCloud supports many fiat currencies; keep a curated list matching our CurrencyCode union.
  CRYPTOCLOUD: [
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
  ],
};

export function isCurrencySupportedByProvider(args: { provider: PaymentProviderKey; currency: string | null | undefined }): boolean {
  const cur = String(args.currency ?? '').trim().toUpperCase();
  const list = PROVIDER_SUPPORTED_CURRENCIES[args.provider] ?? [];
  return list.includes(cur as any);
}

