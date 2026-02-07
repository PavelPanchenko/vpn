import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TelegramReplyOptions } from '../telegram-runtime.types';
import { getTelegramMiniAppUrl } from '../mini-app/mini-app-url';
import type { BotLang } from '../i18n/bot-lang';

export async function buildMainMenuKeyboard(args: {
  prisma: PrismaService;
  config: ConfigService;
  lang: BotLang;
  user:
    | {
        id?: string;
        serverId?: string | null;
        userServers?: unknown[];
      }
    | null;
}): Promise<TelegramReplyOptions> {
  const { getMarkup } = await import('../telegram-markup.utils');
  const Markup = await getMarkup();

  const langIsEn = args.lang === 'en';
  const langIsUk = args.lang === 'uk';
  const miniAppUrl = getTelegramMiniAppUrl(args.config);
  const miniAppRow =
    miniAppUrl && Markup?.button?.webApp
      ? [
          Markup.button.webApp(
            langIsEn ? '🚀 Open Mini App' : langIsUk ? '🚀 Відкрити Mini App' : '🚀 Открыть Mini App',
            miniAppUrl,
          ),
        ]
      : miniAppUrl
        ? [Markup.button.url(langIsEn ? '🚀 Open Mini App' : langIsUk ? '🚀 Відкрити Mini App' : '🚀 Открыть Mini App', miniAppUrl)]
        : null;

  // Перезагружаем пользователя, чтобы меню не "ломалось" на неподтвержденном выборе локации
  const hydratedUser = args.user?.id
    ? await args.prisma.vpnUser.findUnique({
        where: { id: args.user.id },
        include: {
          userServers: { where: { isActive: true } },
        },
      })
    : args.user;

  const hasActiveLocation = Boolean(
    hydratedUser?.serverId || (hydratedUser?.userServers && hydratedUser.userServers.length > 0),
  );

  if (hasActiveLocation) {
    const rows: unknown[][] = [];
    rows.push([Markup.button.callback(langIsEn ? '📥 Get config' : langIsUk ? '📥 Отримати конфіг' : '📥 Получить конфиг', 'get_config')]);
    rows.push([Markup.button.callback(langIsEn ? '📊 Subscription status' : langIsUk ? '📊 Статус підписки' : '📊 Статус подписки', 'show_status')]);
    rows.push([Markup.button.callback(langIsEn ? '📍 Choose another location' : langIsUk ? '📍 Обрати іншу локацію' : '📍 Выбрать другую локацию', 'back_to_servers')]);
    rows.push([Markup.button.callback(langIsEn ? '💳 Pay subscription' : langIsUk ? '💳 Оплатити підписку' : '💳 Оплатить подписку', 'show_pay')]);
    if (miniAppRow) rows.push(miniAppRow);
    return Markup.inlineKeyboard(rows);
  } else {
    const rows: unknown[][] = [];
    rows.push([Markup.button.callback(langIsEn ? '📍 Choose location' : langIsUk ? '📍 Обрати локацію' : '📍 Выбрать локацию', 'back_to_servers')]);
    rows.push([Markup.button.callback(langIsEn ? '💳 Pay subscription' : langIsUk ? '💳 Оплатити підписку' : '💳 Оплатить подписку', 'show_pay')]);
    if (miniAppRow) rows.push(miniAppRow);
    return Markup.inlineKeyboard(rows);
  }
}

