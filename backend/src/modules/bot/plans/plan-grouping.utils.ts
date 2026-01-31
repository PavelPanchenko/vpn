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

export function formatPlanGroupButtonLabel(group: PlanGroup): string {
  const plan = group.representative;
  const variants = plan.variants ?? [];
  const nonXtr = variants.find((v) => v.currency !== 'XTR');
  const stars = variants.find((v) => v.currency === 'XTR');
  const prices = [nonXtr, stars]
    .filter(Boolean)
    .map((v) => formatPriceShort((v as any).price, (v as any).currency))
    .join(' | ');
  return prices ? `${group.name} — ${prices}` : group.name;
}

