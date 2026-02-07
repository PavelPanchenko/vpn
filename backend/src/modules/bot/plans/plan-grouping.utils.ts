import type { PlanLike } from '../bot-domain.types';

export type PlanGroup = {
  name: string;
  periodDays: number;
  variants: PlanLike[];
  /** План, id которого мы кладём в callback `select_plan_<id>` */
  representative: PlanLike;
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function formatPriceShort(price: number, currency: string): string {
  if (currency === 'RUB') return `${price}₽`;
  if (currency === 'XTR') return `${price}⭐`;
  return `${price} ${currency}`;
}

function pickByPriority<T extends { currency: string }>(variants: T[], priority: string[], exclude?: string[]): T | null {
  const excluded = new Set((exclude ?? []).map((x) => String(x).toUpperCase()));
  for (const code of priority) {
    const v = variants.find((x) => String(x.currency).toUpperCase() === String(code).toUpperCase());
    if (v) return v;
  }
  // fallback: any non-XTR
  return (
    variants.find((v) => {
      const c = String(v.currency).toUpperCase();
      return c !== 'XTR' && !excluded.has(c);
    }) ?? null
  );
}

export function pickVariantForPlatega<T extends { currency: string }>(variants: T[]): T | null {
  // PLATEGA (карта/СБП) показываем только если есть RUB-вариант
  return variants.find((v) => String(v.currency).toUpperCase() === 'RUB') ?? null;
}

export function pickVariantForCryptoCloud<T extends { currency: string }>(variants: T[]): T | null {
  return pickVariantForCryptoCloudByLang(variants, null);
}

export function pickVariantForCryptoCloudByLang<T extends { currency: string }>(
  variants: T[],
  telegramLanguageCode: string | null | undefined,
): T | null {
  const lang = String(telegramLanguageCode ?? '').toLowerCase();
  // uk -> prefer UAH, others -> prefer USD
  const priority = lang.startsWith('uk') ? ['UAH', 'USD', 'EUR'] : ['USD', 'EUR', 'UAH'];
  // Приоритет: приоритетные -> любой non-XTR, но не RUB (RUB оставляем для PLATEGA)
  return pickByPriority(variants, priority, ['RUB']);
}

export function pickVariantForStars<T extends { currency: string }>(variants: T[]): T | null {
  return variants.find((v) => v.currency === 'XTR') ?? null;
}

export function groupPlansByNameAndPeriod(plans: PlanLike[]): PlanGroup[] {
  const map = new Map<string, Omit<PlanGroup, 'representative'>>();

  for (const p of plans) {
    const key = `${normalizeName(p.name)}::${p.periodDays}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { name: p.name, periodDays: p.periodDays, variants: [p] });
    } else {
      existing.variants.push(p);
    }
  }

  const groups: PlanGroup[] = [];
  for (const g of map.values()) {
    // представитель — просто один из планов группы
    const representative = g.variants[0];
    groups.push({ ...g, representative });
  }

  // Сортировка: сначала те, где есть non-XTR variant, затем по periodDays, затем по min price
  groups.sort((a, b) => {
    const aHasNonXtr = a.variants.some((p) => (p.variants ?? []).some((v) => v.currency !== 'XTR'));
    const bHasNonXtr = b.variants.some((p) => (p.variants ?? []).some((v) => v.currency !== 'XTR'));
    if (aHasNonXtr !== bHasNonXtr) return aHasNonXtr ? -1 : 1;
    if (a.periodDays !== b.periodDays) return a.periodDays - b.periodDays;
    const aMin = Math.min(...a.variants.flatMap((p) => (p.variants ?? []).map((v) => v.price)));
    const bMin = Math.min(...b.variants.flatMap((p) => (p.variants ?? []).map((v) => v.price)));
    return aMin - bMin;
  });

  return groups;
}

export function formatPlanGroupButtonLabel(
  group: PlanGroup,
  opts?: { showPlatega?: boolean; showCryptoCloud?: boolean; showStars?: boolean; cryptoTelegramLanguageCode?: string | null },
): string {
  const showPlatega = opts?.showPlatega ?? true;
  const showCryptoCloud = opts?.showCryptoCloud ?? true;
  const showStars = opts?.showStars ?? true;
  const plan = group.representative;
  const variants = plan.variants ?? [];
  const platega = showPlatega ? pickVariantForPlatega(variants as any) : null;
  const crypto = showCryptoCloud ? pickVariantForCryptoCloudByLang(variants as any, opts?.cryptoTelegramLanguageCode ?? null) : null;
  const stars = showStars ? pickVariantForStars(variants as any) : null;
  // Для UX: если валюта USD — показываем как USDT
  const cryptoDisplay = crypto
    ? ({ ...(crypto as any), currency: String((crypto as any).currency).toUpperCase() === 'USD' ? 'USDT' : (crypto as any).currency } as any)
    : null;
  const prices = [platega, cryptoDisplay, stars]
    .filter(Boolean)
    .map((v) => formatPriceShort((v as any).price, (v as any).currency))
    .join(' | ');
  return prices ? `${group.name} — ${prices}` : group.name;
}

