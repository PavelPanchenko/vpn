import { buildSubscriptionMetrics } from '../../../common/subscription/subscription-metrics';
import { toDateLike, type UserLikeBase, type UserLikeWithServers } from '../../../common/subscription/user-like';

const STATUS_EMOJI: Record<string, string> = { NEW: '🆕', ACTIVE: '✅', BLOCKED: '🚫', EXPIRED: '⏰' };
const STATUS_LABEL: Record<string, string> = {
  NEW: 'Без подписки',
  ACTIVE: 'Активен',
  BLOCKED: 'Заблокирован',
  EXPIRED: 'Истёк',
};

function fmtTimeRu(d: Date): string {
  try {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function buildStatusHtmlMessage(args: {
  user: UserLikeWithServers;
  esc: (s: unknown) => string;
  fmtDate: (d: Date) => string;
}): string {
  const { user, esc, fmtDate } = args;
  const lastSub = user.subscriptions?.[0] ?? null;

  const metrics = buildSubscriptionMetrics({
    currentStatus: user.status,
    expiresAt: user.expiresAt,
    startsAt: lastSub?.startsAt,
    endsAt: lastSub?.endsAt,
    periodDays: lastSub?.periodDays ?? null,
  });

  let message = `${STATUS_EMOJI[metrics.status] || 'ℹ️'} <b>Статус</b>: ${esc(STATUS_LABEL[metrics.status] || metrics.status)}\n`;

  // Информация о подписке
  if (metrics.expiresAtIso) {
    const expiresAt = new Date(metrics.expiresAtIso);
    const daysLeft = metrics.daysLeft ?? 0;
    if (daysLeft > 0) {
      const time = fmtTimeRu(expiresAt);
      message += `\n📅 До: <b>${esc(fmtDate(expiresAt))}${time ? `, ${esc(time)}` : ''}</b>\n`;
      message += `⏳ Осталось: <b>${esc(daysLeft)}</b> дн.\n`;
    } else {
      message += `\n⏰ Подписка истекла\n💳 Продлить: <code>/pay</code>\n`;
    }
  } else {
    message += `\n📅 Подписка не активирована\n`;
    if (!user.userServers || user.userServers.length === 0) {
      message += `📍 Выберите локацию: <code>/start</code>\n`;
    }
  }

  // Выбранная локация (активная)
  const activeServerName =
    user.userServers && user.userServers.length > 0 ? (user.userServers[0]?.server as any)?.name : null;
  if (activeServerName) {
    message += `\n📍 <b>Локация</b>: ${esc(activeServerName)}\n`;
  } else {
    message += `\n📍 Локация не выбрана\n📍 Выбрать: <code>/start</code>\n`;
  }

  // Что дальше (короткий CTA)
  if (metrics.status === 'ACTIVE') {
    if (activeServerName) {
      message += `\n📥 Получить конфиг: <code>/config</code>\n`;
    }
  } else if (metrics.status === 'NEW') {
    message += `\n💳 Купить подписку: <code>/pay</code>\n`;
  } else if (metrics.status === 'EXPIRED') {
    // строка продления уже есть выше, не дублируем
  } else {
    message += `\n💬 Если есть вопросы — <code>/support</code>\n`;
  }

  // Детали последней подписки (одна запись; общий срок уже выше — «Осталось дней»)
  if (lastSub) {
    const starts = toDateLike(lastSub.startsAt);
    const ends = toDateLike(lastSub.endsAt);
    message +=
      `\n📦 Последний период: <b>${esc(lastSub.periodDays)}</b> дн.\n` +
      (starts && ends ? `(${esc(fmtDate(starts))} – ${esc(fmtDate(ends))})\n` : '');
  }

  return message;
}

export function buildStatusMenuSnippet(args: { user: UserLikeWithServers; fmtDate: (d: Date) => string }): string {
  const { user, fmtDate } = args;
  const lastSub = user.subscriptions?.[0] ?? null;

  const metrics = buildSubscriptionMetrics({
    currentStatus: user.status,
    expiresAt: user.expiresAt,
    startsAt: lastSub?.startsAt,
    endsAt: lastSub?.endsAt,
    periodDays: lastSub?.periodDays ?? null,
  });

  const statusLabel = STATUS_LABEL[metrics.status] || metrics.status;
  let text = `\n\n${STATUS_EMOJI[metrics.status] || '❓'} Статус: ${statusLabel}`;

  if (metrics.expiresAtIso) {
    const expiresAt = new Date(metrics.expiresAtIso);
    const daysLeft = metrics.daysLeft ?? 0;
    if (daysLeft > 0) {
      const time = fmtTimeRu(expiresAt);
      text += `\n📅 До: ${fmtDate(expiresAt)}${time ? `, ${time}` : ''}`;
      text += `\n⏳ Осталось: ${daysLeft} дн.`;
    } else {
      text += `\n⏰ Подписка истекла`;
    }
  } else {
    text += `\n📅 Подписка не установлена`;
  }

  const activeServerName =
    user.userServers && user.userServers.length > 0 ? (user.userServers[0]?.server as any)?.name : null;
  if (activeServerName) {
    text += `\n📍 Локация: ${String(activeServerName)}`;
  }

  return text;
}

