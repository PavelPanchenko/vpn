/** Задержка перед автоудалением «шумных» сообщений (инфо, помощь, статус, конфиг, оплата, QR). */
export const DELETE_MESSAGE_AFTER_MS = 10 * 60 * 1000; // 10 минут

export type DeleteMessageApi = {
  deleteMessage: (chatId: string | number, messageId: number) => Promise<unknown>;
};

/**
 * Удаляет сообщение в чате через заданную задержку (best-effort, ошибки игнорируются).
 */
export function scheduleDeleteMessage(
  api: DeleteMessageApi,
  chatId: string | number,
  messageId: number,
  delayMs: number = DELETE_MESSAGE_AFTER_MS,
): void {
  setTimeout(() => {
    api.deleteMessage(chatId, messageId).catch(() => {});
  }, delayMs);
}

/** Результат reply/editMessageText из Telegraf — объект с chat и message_id, или true при edit. */
type ReplyResult = { chat?: { id: string | number }; message_id?: number } | boolean | null | undefined;

/** Контекст для fallback: при edit API может вернуть true, тогда берём chat/message_id из ctx. */
type CtxFallback = { chat?: { id: string | number }; message?: { message_id?: number } } | null | undefined;

/**
 * Планирует удаление сообщения по результату ctx.reply / ctx.editMessageText.
 * Если в result есть chat и message_id — ставит удаление через DELETE_MESSAGE_AFTER_MS.
 * Если result === true (успешный edit), использует ctx для chatId и message_id.
 */
export function scheduleDeleteMessageFromReply(
  api: DeleteMessageApi,
  result: unknown,
  ctx?: CtxFallback,
): void {
  const msg = result as ReplyResult;
  let chatId: string | number | undefined;
  let messageId: number | undefined;
  if (msg && typeof msg === 'object' && 'chat' in msg && 'message_id' in msg) {
    chatId = (msg as { chat: { id: string | number }; message_id: number }).chat?.id;
    messageId = (msg as { message_id: number }).message_id;
  } else if (result === true && ctx?.chat?.id != null && ctx?.message?.message_id != null) {
    chatId = ctx.chat.id;
    messageId = ctx.message.message_id;
  }
  if (chatId != null && messageId != null) {
    scheduleDeleteMessage(api, chatId, messageId);
  }
}
