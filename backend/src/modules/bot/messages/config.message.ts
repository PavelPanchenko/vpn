import type { Logger } from '@nestjs/common';
import type { UsersService } from '../../users/users.service';
import type { TelegramMessageCtx, TelegramReplyOptions } from '../telegram-runtime.types';
import type { UserForConfigMessage } from '../bot-user.types';

export const CONFIG_CHOICE_HTML = `📥 <b>Как показать конфиг?</b>`;

export type ConfigDataResult =
  | { ok: true; url: string; serverName: string }
  | { ok: false; htmlMessage: string };

/** Проверка пользователя и получение конфига. DRY для выбора «QR / Ссылка» и sendConfigMessage. */
export async function getConfigData(args: {
  user: UserForConfigMessage;
  usersService: UsersService;
  logger: Logger;
  esc: (s: unknown) => string;
}): Promise<ConfigDataResult> {
  const { user, usersService, logger, esc } = args;
  if (!user) {
    return { ok: false, htmlMessage: '❌ Пользователь не найден. Нажмите <code>/start</code> для регистрации.' };
  }
  if (user.status === 'BLOCKED') {
    return { ok: false, htmlMessage: '🚫 <b>Аккаунт заблокирован</b>\n\nСвяжитесь с поддержкой: <code>/support</code>' };
  }
  if (user.status === 'EXPIRED') {
    return { ok: false, htmlMessage: '⏰ <b>Подписка истекла</b>\n\nПродлить: <code>/pay</code>' };
  }
  let configResult: { configs?: Array<{ url: string; serverName?: string }> } | null = null;
  try {
    configResult = await usersService.getConfig(user.id);
  } catch (e: unknown) {
    logger.error('Failed to get/sync config:', e);
    return {
      ok: false,
      htmlMessage:
        `⚠️ <b>Не удалось подготовить конфигурацию</b>\n\n` +
        `Мы попытались синхронизировать доступ на сервере, но произошла ошибка.\n` +
        `Попробуйте ещё раз через минуту или напишите в поддержку: <code>/support</code>`,
    };
  }
  if (!configResult?.configs?.length) {
    return {
      ok: false,
      htmlMessage: `📍 <b>Локация не выбрана</b>\n\nОткройте меню и выберите локацию: <code>/start</code>`,
    };
  }
  const first = configResult.configs[0];
  return { ok: true, url: first.url, serverName: first.serverName ?? '' };
}

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
  /** Опциональная клавиатура под сообщением со ссылкой на конфиг (например кнопка «В меню»). */
  configMessageExtra?: TelegramReplyOptions;
}) {
  const { ctx, user, usersService, logger, replyHtml, esc, configMessageExtra } = args;
  const data = await getConfigData({ user, usersService, logger, esc });
  if (!data.ok) {
    await replyHtml(ctx, data.htmlMessage);
    return;
  }
  const { url: configUrl, serverName } = data;

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

  // Ссылка конфигурации (при вызове из callback можно передать кнопку «В меню»)
  await replyHtml(
    ctx,
    `📥 <b>Конфигурация</b> <i>(${esc(serverName)})</i>\n\n` +
      `<pre>${esc(configUrl)}</pre>\n` +
      `Скопируйте ссылку и импортируйте в приложение.`,
    configMessageExtra,
  );
}

/** Текст сообщения «только ссылка» для редактирования. */
export function configLinkHtml(args: { url: string; serverName: string; esc: (s: unknown) => string }): string {
  const { url, serverName, esc } = args;
  return (
    `📥 <b>Конфигурация</b> <i>(${esc(serverName)})</i>\n\n` +
    `<pre>${esc(url)}</pre>\n` +
    `Скопируйте ссылку и импортируйте в приложение.`
  );
}

/** Результат отправки QR: chatId и messageId для последующего удаления. */
export type SendConfigQrPhotoResult = { chatId: string | number; messageId: number } | null;

/** Отправляет только QR-код конфига (новое сообщение). Возвращает chatId и messageId для удаления через N минут. */
export async function sendConfigQrPhoto(args: {
  ctx: TelegramMessageCtx & {
    replyWithPhoto?: (
      photo: { source: Buffer },
      extra?: TelegramReplyOptions,
    ) => Promise<unknown>;
  };
  url: string;
  serverName: string;
  esc: (s: unknown) => string;
  logger: Logger;
}): Promise<SendConfigQrPhotoResult> {
  const { ctx, url, serverName, esc, logger } = args;
  try {
    const QRCode = await import('qrcode');
    const qrBuffer = await QRCode.toBuffer(url, {
      errorCorrectionLevel: 'M',
      type: 'png',
      width: 400,
      margin: 2,
    });
    const result = (await ctx.replyWithPhoto?.(
      { source: qrBuffer },
      {
        caption:
          `📱 <b>QR для подключения</b>\n` +
          `<i>${esc(serverName)}</i>\n\n` +
          `Отсканируйте QR в вашем VPN‑клиенте.`,
        parse_mode: 'HTML',
      },
    )) as { chat?: { id: string | number }; message_id?: number } | undefined;
    if (result?.chat?.id != null && result?.message_id != null) {
      return { chatId: result.chat.id, messageId: result.message_id };
    }
    return null;
  } catch (e: unknown) {
    logger.error('Failed to generate QR code:', e);
    throw e;
  }
}

/** Генерация QR-буфера по URL конфига. DRY для главного меню с QR. */
export async function generateConfigQrBuffer(url: string): Promise<Buffer> {
  const QRCode = await import('qrcode');
  return QRCode.toBuffer(url, {
    errorCorrectionLevel: 'M',
    type: 'png',
    width: 400,
    margin: 2,
  });
}

