import type { Logger } from '@nestjs/common';
import type { UsersService } from '../../users/users.service';
import type { TelegramMessageCtx, TelegramReplyOptions } from '../telegram-runtime.types';
import type { UserForConfigMessage } from '../bot-user.types';

export async function sendConfigMessage(args: {
  ctx: TelegramMessageCtx & {
    replyWithPhoto?: (
      photo: { source: Buffer },
      extra?: TelegramReplyOptions,
    ) => Promise<unknown>;
  };
  user: UserForConfigMessage;
  usersService: UsersService;
  logger: Logger;
  replyHtml: (ctx: TelegramMessageCtx, html: string, extra?: TelegramReplyOptions) => Promise<unknown>;
  esc: (s: unknown) => string;
}) {
  const { ctx, user, usersService, logger, replyHtml, esc } = args;

  if (!user) {
    await replyHtml(ctx, '❌ Пользователь не найден. Нажмите <code>/start</code> для регистрации.');
    return;
  }
  if (user.status === 'BLOCKED') {
    await replyHtml(ctx, '🚫 <b>Аккаунт заблокирован</b>\n\nСвяжитесь с поддержкой: <code>/support</code>');
    return;
  }
  if (user.status === 'EXPIRED') {
    await replyHtml(ctx, '⏰ <b>Подписка истекла</b>\n\nПродлить: <code>/pay</code>');
    return;
  }

  const configResult = await usersService.getConfig(user.id);
  if (!configResult?.configs?.length) {
    await replyHtml(
      ctx,
      `📍 <b>Локация не выбрана</b>\n\n` + `Откройте меню и выберите локацию: <code>/start</code>`,
    );
    return;
  }

  const configUrl = configResult.configs[0].url;
  const serverName = configResult.configs[0].serverName;

  // QR код (best-effort)
  try {
    const QRCode = await import('qrcode');
    const qrBuffer = await QRCode.toBuffer(configUrl, {
      errorCorrectionLevel: 'M',
      type: 'png',
      width: 400,
      margin: 2,
    });
    await ctx.replyWithPhoto?.(
      { source: qrBuffer },
      {
        caption:
          `📱 <b>QR для подключения</b>\n` +
          `<i>${esc(serverName)}</i>\n\n` +
          `Отсканируйте QR в вашем VPN‑клиенте.`,
        parse_mode: 'HTML',
      },
    );
  } catch (qrError: unknown) {
    logger.error('Failed to generate QR code:', qrError);
    await replyHtml(ctx, '⚠️ Не удалось сгенерировать QR‑код. Ниже доступна ссылка конфигурации.');
  }

  // Ссылка конфигурации
  await replyHtml(
    ctx,
    `📥 <b>Конфигурация</b> <i>(${esc(serverName)})</i>\n\n` +
      `<pre>${esc(configUrl)}</pre>\n` +
      `Скопируйте ссылку и импортируйте в приложение.`,
  );
}

