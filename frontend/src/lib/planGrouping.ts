import type { MiniPlan } from './miniTypes';
import { formatPrice } from './formatters';

export type MiniPlanGroup = {
  key: string;
  name: string;
  periodDays: number;
  description?: string | null;
  isTop?: boolean;
  variants: MiniPlan[];
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function pickVariantForExternal(group: MiniPlanGroup): MiniPlan | null {
  // Приоритет: RUB -> USD -> любой не-XTR
  return group.variants.find((v) => v.currency === 'RUB') ?? group.variants.find((v) => v.currency === 'USD') ?? group.variants.find((v) => v.currency !== 'XTR') ?? null;
}

function pickVariantForStars(group: MiniPlanGroup): MiniPlan | null {
  return group.variants.find((v) => v.currency === 'XTR') ?? null;
}

export function formatPlanGroupPrice(group: MiniPlanGroup): string {
  const external = pickVariantForExternal(group);
  const stars = pickVariantForStars(group);

  const parts: string[] = [];
  if (external) parts.push(formatPrice(external.price, external.currency));
  if (stars) parts.push(formatPrice(stars.price, stars.currency));

  return parts.join(' | ');
}

export function groupPlans(plans: MiniPlan[]): MiniPlanGroup[] {
  const map = new Map<string, MiniPlanGroup>();

  for (const p of plans) {
    const key = `${normalizeName(p.name)}::${p.periodDays}`;
    const g = map.get(key);
    if (!g) {
      map.set(key, {
        key,
        name: p.name,
        periodDays: p.periodDays,
        description: p.description ?? null,
        isTop: p.isTop ?? false,
        variants: [p],
      });
    } else {
      g.variants.push(p);
      g.isTop = Boolean(g.isTop || p.isTop);
      if (!g.description && p.description) g.description = p.description;
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.isTop && !b.isTop) return -1;
    if (!a.isTop && b.isTop) return 1;
    return a.periodDays - b.periodDays;
  });
}

