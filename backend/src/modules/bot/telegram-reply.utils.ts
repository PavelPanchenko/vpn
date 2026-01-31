import type { TelegramCallbackCtx, TelegramMessageCtx, TelegramReplyOptions } from './telegram-runtime.types';

export function replyHtml(ctx: TelegramMessageCtx, html: string, extra?: TelegramReplyOptions) {
  return ctx.reply(html, { parse_mode: 'HTML', disable_web_page_preview: true, ...(extra ?? {}) });
}

export function editHtml(ctx: TelegramCallbackCtx, html: string, extra?: TelegramReplyOptions) {
  return ctx.editMessageText(html, { parse_mode: 'HTML', disable_web_page_preview: true, ...(extra ?? {}) });
}

/** DRY: пытаемся отредактировать, иначе отправляем новое сообщение. */
export async function editOrReplyHtml(ctx: TelegramCallbackCtx, html: string, extra?: TelegramReplyOptions) {
  try {
    return await editHtml(ctx, html, extra);
  } catch {
    return await replyHtml(ctx, html, extra);
  }
}

