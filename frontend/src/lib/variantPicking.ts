export type VariantLike = { currency: string };

export type SimpleLang = 'ru' | 'en' | 'uk';

export function pickStarsVariant<T extends VariantLike>(variants: T[] | null | undefined): T | null {
  const v = variants ?? [];
  return v.find((x) => String(x.currency).toUpperCase() === 'XTR') ?? null;
}

function pickByPriority<T extends VariantLike>(variants: T[] | null | undefined, priority: string[]): T | null {
  const v = variants ?? [];
  for (const code of priority) {
    const found = v.find((x) => String(x.currency).toUpperCase() === String(code).toUpperCase());
    if (found) return found;
  }
  return v.find((x) => String(x.currency).toUpperCase() !== 'XTR') ?? null;
}

export function pickExternalVariant<T extends VariantLike>(variants: T[] | null | undefined): T | null {
  // legacy default: RUB -> USD -> any non-XTR
  return pickByPriority(variants, ['RUB', 'USD']);
}

export function pickPlategaVariant<T extends VariantLike>(variants: T[] | null | undefined): T | null {
  const v = variants ?? [];
  return v.find((x) => String(x.currency).toUpperCase() === 'RUB') ?? null;
}

export function pickCryptoCloudVariant<T extends VariantLike>(variants: T[] | null | undefined, lang?: SimpleLang): T | null {
  // uk -> prefer UAH, others -> prefer USD
  const priority = lang === 'uk' ? ['UAH', 'USD', 'EUR'] : ['USD', 'EUR', 'UAH'];
  const v = variants ?? [];
  const preferred = pickByPriority(v, priority);
  if (preferred && String(preferred.currency).toUpperCase() !== 'RUB') return preferred;
  const nonRub = v.find((x) => {
    const c = String(x.currency).toUpperCase();
    return c !== 'XTR' && c !== 'RUB';
  });
  return nonRub ?? v.find((x) => String(x.currency).toUpperCase() !== 'XTR') ?? null;
}

