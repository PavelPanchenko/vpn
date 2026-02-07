import type { MiniPlan } from './miniTypes';
import { formatPrice } from './formatters';
import { pickCryptoCloudVariant, pickPlategaVariant, pickStarsVariant, type SimpleLang } from './variantPicking';

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

export function formatPlanGroupPrice(group: MiniPlanGroup): string {
  return formatPlanGroupPriceForProviders(group, { TELEGRAM_STARS: true, PLATEGA: true });
}

export function formatPlanGroupPriceForProviders(
  group: MiniPlanGroup,
  providers: { TELEGRAM_STARS: boolean; PLATEGA: boolean; CRYPTOCLOUD?: boolean },
  opts?: { lang?: SimpleLang },
): string {
  const platega = pickPlategaVariant(group.variants);
  const crypto = pickCryptoCloudVariant(group.variants, opts?.lang);
  const stars = pickStarsVariant(group.variants);

  const parts: string[] = [];
  if (providers.PLATEGA && platega) parts.push(formatPrice(platega.price, platega.currency));
  if (providers.CRYPTOCLOUD && crypto) {
    const cur = String(crypto.currency).toUpperCase();
    const displayCur = cur === 'USD' ? 'USDT' : crypto.currency;
    parts.push(formatPrice(crypto.price, displayCur));
  }
  if (providers.TELEGRAM_STARS && stars) parts.push(formatPrice(stars.price, stars.currency));

  // Dedup (if same label appears twice)
  return Array.from(new Set(parts)).join(' | ');
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

