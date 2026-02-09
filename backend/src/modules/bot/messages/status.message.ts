import { buildSubscriptionMetrics } from '../../../common/subscription/subscription-metrics';
import { toDateLike, type UserLikeBase, type UserLikeWithServers } from '../../../common/subscription/user-like';
import type { BotLang } from '../i18n/bot-lang';

const STATUS_EMOJI: Record<string, string> = { NEW: '🆕', ACTIVE: '✅', BLOCKED: '🚫', EXPIRED: '⏰' };
const STATUS_LABEL: Record<BotLang, Record<string, string>> = {
  ru: {
    NEW: 'Без подписки',
    ACTIVE: 'Активен',
    BLOCKED: 'Заблокирован',
    EXPIRED: 'Истёк',
  },
  en: {
    NEW: 'No subscription',
    ACTIVE: 'Active',
    BLOCKED: 'Blocked',
    EXPIRED: 'Expired',
  },
  uk: {
    NEW: 'Без підписки',
    ACTIVE: 'Активний',
    BLOCKED: 'Заблоковано',
    EXPIRED: 'Закінчився',
  },
};

function fmtTime(d: Date, lang: BotLang): string {
  try {
    const locale = lang === 'en' ? 'en-GB' : lang === 'uk' ? 'uk-UA' : 'ru-RU';
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function buildStatusHtmlMessage(args: {
  lang: BotLang;
  user: UserLikeWithServers;
  esc: (s: unknown) => string;
  fmtDate: (d: Date) => string;
}): string {
  const { lang, user, esc, fmtDate } = args;
  const lastSub = user.subscriptions?.[0] ?? null;

  const metrics = buildSubscriptionMetrics({
    currentStatus: user.status,
    expiresAt: user.expiresAt,
    startsAt: lastSub?.startsAt,
    endsAt: lastSub?.endsAt,
    periodDays: lastSub?.periodDays ?? null,
  });

  const statusLabel = (STATUS_LABEL[lang] ?? STATUS_LABEL.ru)[metrics.status] || metrics.status;
  let message = `${STATUS_EMOJI[metrics.status] || 'ℹ️'} <b>${
    lang === 'en' ? 'Status' : lang === 'uk' ? 'Статус' : 'Статус'
  }</b>: ${esc(statusLabel)}\n`;

  // Информация о подписке
  if (metrics.expiresAtIso) {
    const expiresAt = new Date(metrics.expiresAtIso);
    const daysLeft = metrics.daysLeft ?? 0;
    if (daysLeft > 0) {
      const time = fmtTime(expiresAt, lang);
      message += `\n📅 ${lang === 'en' ? 'Until' : lang === 'uk' ? 'До' : 'До'}: <b>${esc(fmtDate(expiresAt))}${time ? `, ${esc(time)}` : ''}</b>\n`;
      message += `⏳ ${lang === 'en' ? 'Left' : lang === 'uk' ? 'Залишилось' : 'Осталось'}: <b>${esc(daysLeft)}</b> ${
        lang === 'en' ? 'day(s)' : 'дн.'
      }\n`;
    } else {
      message +=
        lang === 'en'
          ? `\n⏰ Subscription expired\n💳 Extend: /pay\n`
          : lang === 'uk'
            ? `\n⏰ Підписка закінчилась\n💳 Подовжити: /pay\n`
          : `\n⏰ Подписка истекла\n💳 Продлить: /pay\n`;
    }
  } else {
    message +=
      lang === 'en' ? `\n📅 Subscription not activated\n` : lang === 'uk' ? `\n📅 Підписку не активовано\n` : `\n📅 Подписка не активирована\n`;
    if (!user.userServers || user.userServers.length === 0) {
      message +=
        lang === 'en'
          ? `📍 Choose location: <code>/start</code>\n`
          : lang === 'uk'
            ? `📍 Виберіть локацію: <code>/start</code>\n`
            : `📍 Выберите локацию: <code>/start</code>\n`;
    }
  }

  // Выбранная локация (активная)
  const activeServerName =
    user.userServers && user.userServers.length > 0 ? (user.userServers[0]?.server as any)?.name : null;
  if (activeServerName) {
    message += `\n📍 <b>${lang === 'en' ? 'Location' : lang === 'uk' ? 'Локація' : 'Локация'}</b>: ${esc(activeServerName)}\n`;
  } else {
    message +=
      lang === 'en'
        ? `\n📍 Location not selected\n📍 Choose: <code>/start</code>\n`
        : lang === 'uk'
          ? `\n📍 Локацію не вибрано\n📍 Вибрати: <code>/start</code>\n`
        : `\n📍 Локация не выбрана\n📍 Выбрать: <code>/start</code>\n`;
  }

  // Что дальше (короткий CTA)
  if (metrics.status === 'ACTIVE') {
    if (activeServerName) {
      message +=
        lang === 'en'
          ? `\n📥 Get config: <code>/config</code>\n`
          : lang === 'uk'
            ? `\n📥 Отримати конфіг: <code>/config</code>\n`
            : `\n📥 Получить конфиг: <code>/config</code>\n`;
    }
  } else if (metrics.status === 'NEW') {
    message +=
      lang === 'en'
        ? `\n💳 Buy subscription: /pay\n`
        : lang === 'uk'
          ? `\n💳 Купити підписку: /pay\n`
          : `\n💳 Купить подписку: /pay\n`;
  } else if (metrics.status === 'EXPIRED') {
    // строка продления уже есть выше, не дублируем
  } else {
    message +=
      lang === 'en'
        ? `\n💬 Questions? <code>/support</code>\n`
        : lang === 'uk'
          ? `\n💬 Є питання? <code>/support</code>\n`
          : `\n💬 Если есть вопросы — <code>/support</code>\n`;
  }

  // Детали последней подписки (одна запись; общий срок уже выше — «Осталось дней»)
  if (lastSub) {
    const starts = toDateLike(lastSub.startsAt);
    const ends = toDateLike(lastSub.endsAt);
    message +=
      (lang === 'en'
        ? `\n📦 Last period: <b>${esc(lastSub.periodDays)}</b> day(s)\n`
        : lang === 'uk'
          ? `\n📦 Останній період: <b>${esc(lastSub.periodDays)}</b> дн.\n`
        : `\n📦 Последний период: <b>${esc(lastSub.periodDays)}</b> дн.\n`) +
      (starts && ends ? `(${esc(fmtDate(starts))} – ${esc(fmtDate(ends))})\n` : '');
  }

  return message;
}

export function buildStatusMenuSnippet(args: { lang: BotLang; user: UserLikeWithServers; fmtDate: (d: Date) => string }): string {
  const { lang, user, fmtDate } = args;
  const lastSub = user.subscriptions?.[0] ?? null;

  const metrics = buildSubscriptionMetrics({
    currentStatus: user.status,
    expiresAt: user.expiresAt,
    startsAt: lastSub?.startsAt,
    endsAt: lastSub?.endsAt,
    periodDays: lastSub?.periodDays ?? null,
  });

  const statusLabel = (STATUS_LABEL[lang] ?? STATUS_LABEL.ru)[metrics.status] || metrics.status;
  let text = `\n\n${STATUS_EMOJI[metrics.status] || '❓'} ${lang === 'en' ? 'Status' : lang === 'uk' ? 'Статус' : 'Статус'}: ${statusLabel}`;

  if (metrics.expiresAtIso) {
    const expiresAt = new Date(metrics.expiresAtIso);
    const daysLeft = metrics.daysLeft ?? 0;
    if (daysLeft > 0) {
      const time = fmtTime(expiresAt, lang);
      text += `\n📅 ${lang === 'en' ? 'Until' : lang === 'uk' ? 'До' : 'До'}: ${fmtDate(expiresAt)}${time ? `, ${time}` : ''}`;
      text += `\n⏳ ${lang === 'en' ? 'Left' : lang === 'uk' ? 'Залишилось' : 'Осталось'}: ${daysLeft} ${lang === 'en' ? 'day(s)' : 'дн.'}`;
    } else {
      text += lang === 'en' ? `\n⏰ Subscription expired` : lang === 'uk' ? `\n⏰ Підписка закінчилась` : `\n⏰ Подписка истекла`;
    }
  } else {
    text +=
      lang === 'en' ? `\n📅 Subscription not set` : lang === 'uk' ? `\n📅 Підписку не встановлено` : `\n📅 Подписка не установлена`;
  }

  const activeServerName =
    user.userServers && user.userServers.length > 0 ? (user.userServers[0]?.server as any)?.name : null;
  if (activeServerName) {
    text += `\n📍 ${lang === 'en' ? 'Location' : lang === 'uk' ? 'Локація' : 'Локация'}: ${String(activeServerName)}`;
  }

  return text;
}

