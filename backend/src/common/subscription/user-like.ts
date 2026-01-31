import type { VpnUserStatus } from './subscription-metrics';

export type DateLike = Date | string | null | undefined;

export type SubscriptionLike = {
  startsAt?: DateLike;
  endsAt?: DateLike;
  periodDays?: number | null | undefined;
};

export type UserLikeBase = {
  status: VpnUserStatus | null | undefined;
  expiresAt: DateLike;
  subscriptions?: SubscriptionLike[];
};

export type UserLikeWithServers = UserLikeBase & {
  userServers?: Array<{ server?: { name: unknown } }>;
};

export function toDateLike(v: DateLike): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

