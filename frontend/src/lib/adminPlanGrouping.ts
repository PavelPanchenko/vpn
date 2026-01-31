import { formatPrice } from './formatters';

export type AdminPlanLike = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  periodDays: number;
  price: number;
  currency: string;
  isTrial: boolean;
  active: boolean;
  legacy: boolean;
  availableFor: 'ALL' | 'NEW_USERS' | 'EXISTING_USERS';
  isTop: boolean;
};

export type AdminPlanGroup = {
  key: string;
  name: string;
  description?: string | null;
  periodDays: number;
  isTrial: boolean;
  variants: AdminPlanLike[];
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export function groupAdminPlans(plans: AdminPlanLike[]): AdminPlanGroup[] {
  const map = new Map<string, AdminPlanGroup>();

  for (const p of plans) {
    // trial группируем отдельно от paid, даже если совпадает name+period
    const key = `${normalizeName(p.name)}::${p.periodDays}::${p.isTrial ? 'trial' : 'paid'}`;
    const g = map.get(key);
    if (!g) {
      map.set(key, {
        key,
        name: p.name,
        description: p.description ?? null,
        periodDays: p.periodDays,
        isTrial: p.isTrial,
        variants: [p],
      });
    } else {
      g.variants.push(p);
      if (!g.description && p.description) g.description = p.description;
    }
  }

  const groups = Array.from(map.values());

  // Стабильная сортировка: trial наверху, затем по periodDays
  groups.sort((a, b) => {
    if (a.isTrial !== b.isTrial) return a.isTrial ? -1 : 1;
    if (a.periodDays !== b.periodDays) return a.periodDays - b.periodDays;
    return a.name.localeCompare(b.name);
  });

  // Внутри группы: сначала не-XTR, потом XTR, затем по цене
  for (const g of groups) {
    g.variants.sort((a, b) => {
      const ax = a.currency === 'XTR';
      const bx = b.currency === 'XTR';
      if (ax !== bx) return ax ? 1 : -1;
      if (a.currency !== b.currency) return a.currency.localeCompare(b.currency);
      return a.price - b.price;
    });
  }

  return groups;
}

export function formatAdminPlanGroupPrice(group: AdminPlanGroup): string {
  const parts: string[] = [];
  for (const v of group.variants) {
    const label = formatPrice(v.price, v.currency);
    if (!parts.includes(label)) parts.push(label);
  }
  return parts.join(' | ');
}

export function formatAdminPlanGroupCodes(group: AdminPlanGroup): string {
  return group.variants.map((v) => v.code).join(', ');
}

