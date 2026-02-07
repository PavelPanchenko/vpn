import type { Logger } from '@nestjs/common';
import type { UsersService } from '../../users/users.service';
import type { TelegramMessageCtx, TelegramReplyOptions } from '../telegram-runtime.types';
import type { UserForConfigMessage } from '../bot-user.types';
import type { BotLang } from '../i18n/bot-lang';

const V2RAYTUN_URL = 'https://v2raytun.com';

function v2rayTunHintHtml(lang: BotLang): string {
  if (lang === 'en') return `📱 <b>Recommended app:</b> V2RayTun\n${V2RAYTUN_URL}`;
  if (lang === 'uk') return `📱 <b>Рекомендований застосунок:</b> V2RayTun\n${V2RAYTUN_URL}`;
  return `📱 <b>Рекомендуемое приложение:</b> V2RayTun\n${V2RAYTUN_URL}`;
}

export function configChoiceHtml(lang: BotLang): string {
  if (lang === 'en') return `📥 <b>How to show the config?</b>`;
  if (lang === 'uk') return `📥 <b>Як показати конфіг?</b>`;
  return `📥 <b>Как показать конфиг?</b>`;
}

export type ConfigDataResult =
  | { ok: true; url: string; serverName: string }
  | { ok: false; htmlMessage: string };

/** Проверка пользователя и получение конфига. DRY для выбора «QR / Ссылка» и sendConfigMessage. */
export async function getConfigData(args: {
  user: UserForConfigMessage;
  lang: BotLang;
  usersService: UsersService;
  logger: Logger;
  esc: (s: unknown) => string;
}): Promise<ConfigDataResult> {
  const { user, lang, usersService, logger, esc } = args;
  if (!user) {
    return {
      ok: false,
      htmlMessage:
        lang === 'en'
          ? '❌ User not found. Tap <code>/start</code> to register.'
          : lang === 'uk'
            ? '❌ Користувача не знайдено. Натисніть <code>/start</code> для реєстрації.'
          : '❌ Пользователь не найден. Нажмите <code>/start</code> для регистрации.',
    };
  }
  if (user.status === 'BLOCKED') {
    return {
      ok: false,
      htmlMessage:
        lang === 'en'
          ? '🚫 <b>Account blocked</b>\n\nContact support: <code>/support</code>'
          : lang === 'uk'
            ? '🚫 <b>Акаунт заблоковано</b>\n\nЗверніться до підтримки: <code>/support</code>'
          : '🚫 <b>Аккаунт заблокирован</b>\n\nСвяжитесь с поддержкой: <code>/support</code>',
    };
  }
  if (user.status === 'EXPIRED') {
    return {
      ok: false,
      htmlMessage:
        lang === 'en'
          ? '⏰ <b>Subscription expired</b>\n\nExtend: <code>/pay</code>'
          : lang === 'uk'
            ? '⏰ <b>Підписка закінчилась</b>\n\nПодовжити: <code>/pay</code>'
          : '⏰ <b>Подписка истекла</b>\n\nПродлить: <code>/pay</code>',
    };
  }
  let configResult: { configs?: Array<{ url: string; serverName?: string }> } | null = null;
  try {
    configResult = await usersService.getConfig(user.id);
  } catch (e: unknown) {
    logger.error('Failed to get/sync config:', e);
    return {
      ok: false,
      htmlMessage:
        lang === 'en'
          ? `⚠️ <b>Failed to prepare configuration</b>\n\n` +
            `We tried to sync access on the server, but something went wrong.\n` +
            `Try again in a minute or contact support: <code>/support</code>`
          : lang === 'uk'
            ? `⚠️ <b>Не вдалося підготувати конфігурацію</b>\n\n` +
              `Ми спробували синхронізувати доступ на сервері, але сталася помилка.\n` +
              `Спробуйте ще раз за хвилину або напишіть у підтримку: <code>/support</code>`
          : `⚠️ <b>Не удалось подготовить конфигурацию</b>\n\n` +
            `Мы попытались синхронизировать доступ на сервере, но произошла ошибка.\n` +
            `Попробуйте ещё раз через минуту или напишите в поддержку: <code>/support</code>`,
    };
  }
  if (!configResult?.configs?.length) {
    return {
      ok: false,
      htmlMessage:
        lang === 'en'
          ? `📍 <b>No location selected</b>\n\nOpen the menu and choose a location: <code>/start</code>`
          : lang === 'uk'
            ? `📍 <b>Локацію не вибрано</b>\n\nВідкрийте меню і виберіть локацію: <code>/start</code>`
          : `📍 <b>Локация не выбрана</b>\n\nОткройте меню и выберите локацию: <code>/start</code>`,
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
  lang: BotLang;
  usersService: UsersService;
  logger: Logger;
  replyHtml: (ctx: TelegramMessageCtx, html: string, extra?: TelegramReplyOptions) => Promise<unknown>;
  esc: (s: unknown) => string;
  /** Опциональная клавиатура под сообщением со ссылкой на конфиг (например кнопка «В меню»). */
  configMessageExtra?: TelegramReplyOptions;
}) {
  const { ctx, user, lang, usersService, logger, replyHtml, esc, configMessageExtra } = args;
  const data = await getConfigData({ user, lang, usersService, logger, esc });
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
          lang === 'en'
            ? `📱 <b>QR to connect</b>\n` + `<i>${esc(serverName)}</i>\n\n` + `Scan the QR in your VPN client.\n\n` + v2rayTunHintHtml(lang)
            : lang === 'uk'
              ? `📱 <b>QR для підключення</b>\n` + `<i>${esc(serverName)}</i>\n\n` + `Відскануйте QR у вашому VPN‑клієнті.\n\n` + v2rayTunHintHtml(lang)
              : `📱 <b>QR для подключения</b>\n` + `<i>${esc(serverName)}</i>\n\n` + `Отсканируйте QR в вашем VPN‑клиенте.\n\n` + v2rayTunHintHtml(lang),
        parse_mode: 'HTML',
      },
    );
  } catch (qrError: unknown) {
    logger.error('Failed to generate QR code:', qrError);
    await replyHtml(
      ctx,
      lang === 'en'
        ? '⚠️ Failed to generate QR code. The config link is available below.'
        : lang === 'uk'
          ? '⚠️ Не вдалося згенерувати QR‑код. Нижче доступне посилання на конфіг.'
        : '⚠️ Не удалось сгенерировать QR‑код. Ниже доступна ссылка конфигурации.',
    );
  }

  // Ссылка конфигурации (при вызове из callback можно передать кнопку «В меню»)
  await replyHtml(
    ctx,
    lang === 'en'
      ? `📥 <b>Configuration</b> <i>(${esc(serverName)})</i>\n\n` +
          `<pre>${esc(configUrl)}</pre>\n` +
          `Copy the link and import it into the app.\n\n` +
          v2rayTunHintHtml(lang)
      : lang === 'uk'
        ? `📥 <b>Конфігурація</b> <i>(${esc(serverName)})</i>\n\n` +
            `<pre>${esc(configUrl)}</pre>\n` +
            `Скопіюйте посилання та імпортуйте в застосунок.\n\n` +
            v2rayTunHintHtml(lang)
      : `📥 <b>Конфигурация</b> <i>(${esc(serverName)})</i>\n\n` +
          `<pre>${esc(configUrl)}</pre>\n` +
          `Скопируйте ссылку и импортируйте в приложение.\n\n` +
          v2rayTunHintHtml(lang),
    configMessageExtra,
  );
}

/** Текст сообщения «только ссылка» для редактирования. */
export function configLinkHtml(args: { lang: BotLang; url: string; serverName: string; esc: (s: unknown) => string }): string {
  const { lang, url, serverName, esc } = args;
  return (
    (lang === 'en'
      ? `📥 <b>Configuration</b> <i>(${esc(serverName)})</i>\n\n` +
        `<pre>${esc(url)}</pre>\n` +
        `Copy the link and import it into the app.\n\n` +
        v2rayTunHintHtml(lang)
      : lang === 'uk'
        ? `📥 <b>Конфігурація</b> <i>(${esc(serverName)})</i>\n\n` +
          `<pre>${esc(url)}</pre>\n` +
          `Скопіюйте посилання та імпортуйте в застосунок.\n\n` +
          v2rayTunHintHtml(lang)
      : `📥 <b>Конфигурация</b> <i>(${esc(serverName)})</i>\n\n` +
        `<pre>${esc(url)}</pre>\n` +
        `Скопируйте ссылку и импортируйте в приложение.\n\n` +
        v2rayTunHintHtml(lang))
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
  lang: BotLang;
  esc: (s: unknown) => string;
  logger: Logger;
}): Promise<SendConfigQrPhotoResult> {
  const { ctx, url, serverName, lang, esc, logger } = args;
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
          lang === 'en'
            ? `📱 <b>QR to connect</b>\n` + `<i>${esc(serverName)}</i>\n\n` + `Scan the QR in your VPN client.\n\n` + v2rayTunHintHtml(lang)
            : lang === 'uk'
              ? `📱 <b>QR для підключення</b>\n` + `<i>${esc(serverName)}</i>\n\n` + `Відскануйте QR у вашому VPN‑клієнті.\n\n` + v2rayTunHintHtml(lang)
              : `📱 <b>QR для подключения</b>\n` + `<i>${esc(serverName)}</i>\n\n` + `Отсканируйте QR в вашем VPN‑клиенте.\n\n` + v2rayTunHintHtml(lang),
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

