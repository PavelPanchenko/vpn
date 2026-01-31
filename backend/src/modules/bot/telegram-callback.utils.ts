import type { TelegramCallbackCtx, TelegramMessageCtx, TelegramReplyOptions } from './telegram-runtime.types';

/** Безопасная обёртка над answerCbQuery (в некоторых клиентах может падать). */
export async function answerCbQuerySafe(ctx: Partial<Pick<TelegramCallbackCtx, 'answerCbQuery'>>, text?: string) {
  try {
    if (!ctx.answerCbQuery) return;
    if (text != null) return await ctx.answerCbQuery(text);
    return await ctx.answerCbQuery();
  } catch {
    // ignore
  }
}

/** DRY: ответить в callback и отправить обычное text-сообщение. */
export async function cbThenReplyText(args: {
  ctx: TelegramMessageCtx & Partial<TelegramCallbackCtx>;
  cbText: string;
  replyText: string;
}) {
  await answerCbQuerySafe(args.ctx, args.cbText);
  return args.ctx.reply(args.replyText);
}

/** DRY: ответить в callback и отправить HTML-сообщение через переданную функцию. */
export async function cbThenReplyHtml(args: {
  ctx: TelegramMessageCtx & Partial<TelegramCallbackCtx>;
  cbText: string;
  html: string;
  replyHtml: (ctx: TelegramMessageCtx, html: string, extra?: TelegramReplyOptions) => Promise<unknown>;
}) {
  await answerCbQuerySafe(args.ctx, args.cbText);
  return args.replyHtml(args.ctx, args.html);
}

