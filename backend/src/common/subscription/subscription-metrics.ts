export type VpnUserStatus = 'NEW' | 'ACTIVE' | 'BLOCKED' | 'EXPIRED';

type DateLike = Date | string | null | undefined;

function toDate(v: DateLike): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Сколько дней осталось до expiresAt (0..∞). null если даты нет/некорректна. */
export function calculateDaysLeft(expiresAt: DateLike, now: Date = new Date()): number | null {
  const exp = toDate(expiresAt);
  if (!exp) return null;
  const diffMs = exp.getTime() - now.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

/** Процент "сколько осталось" (0..100) по интервалу startsAt..endsAt. null если интервал невалиден. */
export function calculateProgressLeftPct(startsAt: DateLike, endsAt: DateLike, now: Date = new Date()): number | null {
  const s = toDate(startsAt);
  const e = toDate(endsAt);
  if (!s || !e) return null;
  const starts = s.getTime();
  const ends = e.getTime();
  if (!(ends > starts)) return null;

  const total = ends - starts;
  const left = clamp(ends - now.getTime(), 0, total);
  return clamp((left / total) * 100, 0, 100);
}

/**
 * Единая логика статуса:
 * - BLOCKED не меняем автоматически
 * - если expiresAt отсутствует → оставляем текущий статус (или NEW)
 * - иначе ACTIVE/EXPIRED по expiresAt относительно now
 */
export function calculateUserStatus(
  currentStatus: VpnUserStatus | null | undefined,
  expiresAt: DateLike,
  now: Date = new Date(),
): VpnUserStatus {
  if (currentStatus === 'BLOCKED') return 'BLOCKED';
  const exp = toDate(expiresAt);
  if (!exp) return currentStatus ?? 'NEW';
  return exp.getTime() < now.getTime() ? 'EXPIRED' : 'ACTIVE';
}

export type SubscriptionMetrics = {
  status: VpnUserStatus;
  expiresAtIso: string | null;
  daysLeft: number | null;
  progressLeftPct: number | null;
};

/** DRY: один "снимок" для UI/бота/админки. */
export function buildSubscriptionMetrics(params: {
  currentStatus: VpnUserStatus | null | undefined;
  expiresAt: DateLike;
  startsAt?: DateLike;
  endsAt?: DateLike;
  periodDays?: number | null;
  now?: Date;
}): SubscriptionMetrics {
  const now = params.now ?? new Date();
  const exp = toDate(params.expiresAt);
  const status = calculateUserStatus(params.currentStatus, exp, now);
  const daysLeft = calculateDaysLeft(exp, now);
  const primaryProgress = calculateProgressLeftPct(params.startsAt ?? null, params.endsAt ?? null, now);

  // Защита: если interval невалиден, но есть periodDays + daysLeft — считаем фоллбеком по дням.
  const fallbackProgress =
    primaryProgress == null && daysLeft != null && params.periodDays != null && Number.isFinite(params.periodDays) && params.periodDays > 0
      ? clamp((daysLeft / params.periodDays) * 100, 0, 100)
      : null;

  return {
    status,
    expiresAtIso: exp ? exp.toISOString() : null,
    daysLeft,
    progressLeftPct: primaryProgress ?? fallbackProgress,
  };
}

