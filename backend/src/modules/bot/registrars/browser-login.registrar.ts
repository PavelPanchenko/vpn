import type { TelegramRegistrarDeps } from './telegram-registrar.deps';
import type { TelegramMessageCtx } from '../telegram-runtime.types';
import { BotMessages } from '../messages/common.messages';

function getPublicMiniUrl(args: TelegramRegistrarDeps): string | null {
  const base = args.config.get<string>('PUBLIC_SITE_URL') || '';
  if (base) return `${base.replace(/\/+$/, '')}/mini`;
  const mini = args.config.get<string>('TELEGRAM_MINI_APP_URL') || '';
  return mini || null;
}

export function registerBrowserLoginHandlers(args: TelegramRegistrarDeps) {
  // Команда /web — подсказка + ссылка
  args.bot.command('web', async (ctx: TelegramMessageCtx) => {
    const url = getPublicMiniUrl(args);
    const text =
      `🌐 <b>Web‑версия Mini App</b>\n\n` +
      `1) Откройте страницу Mini App в браузере.\n` +
      `2) На странице будет QR‑код.\n` +
      `3) Отсканируйте QR — откроется этот бот. Нажмите «Start», чтобы подтвердить вход.\n\n` +
      (url ? `Ссылка: ${args.esc(url)}\n` : '') +
      `\nЕсли пользователя ещё нет в системе — сначала нажмите <code>/start</code>.`;
    await args.replyHtml(ctx, text);
  });
}

