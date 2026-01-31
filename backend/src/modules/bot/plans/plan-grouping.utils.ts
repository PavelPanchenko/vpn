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
    // предпочитаем non-XTR как representative (чтобы клик по тарифу не выглядел как “только Stars”)
    const representative =
      g.variants.find((v) => v.currency !== 'XTR') ??
      g.variants.find((v) => v.currency === 'XTR') ??
      g.variants[0];
    groups.push({ ...g, representative });
  }

  // Сортировка: сначала те, где есть non-XTR, затем по periodDays, затем по min price
  groups.sort((a, b) => {
    const aHasNonXtr = a.variants.some((v) => v.currency !== 'XTR');
    const bHasNonXtr = b.variants.some((v) => v.currency !== 'XTR');
    if (aHasNonXtr !== bHasNonXtr) return aHasNonXtr ? -1 : 1;
    if (a.periodDays !== b.periodDays) return a.periodDays - b.periodDays;
    const aMin = Math.min(...a.variants.map((v) => v.price));
    const bMin = Math.min(...b.variants.map((v) => v.price));
    return aMin - bMin;
  });

  return groups;
}

export function formatPlanGroupButtonLabel(group: PlanGroup): string {
  const stars = group.variants.find((v) => v.currency === 'XTR');
  const nonXtr = group.variants.find((v) => v.currency !== 'XTR');

  const prices = [nonXtr, stars]
    .filter(Boolean)
    .map((p) => formatPriceShort((p as PlanLike).price, (p as PlanLike).currency))
    .join(' | ');

  return prices ? `${group.name} — ${prices}` : group.name;
}

