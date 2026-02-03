export type TelegramFrom = {
  id: string | number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type TelegramMessage = {
  message_id?: number;
  date?: number;
  text?: string;
  chat?: TelegramChat;
};

export type TelegramReplyOptions = Record<string, unknown>;

export type TelegramChat = {
  id: string | number;
};

export type TelegramMessageCtx = {
  from: TelegramFrom;
  chat?: TelegramChat;
  message?: TelegramMessage;

  reply: (text: string, extra?: TelegramReplyOptions) => Promise<unknown>;
};

export type TelegramCallbackMatch = RegExpExecArray;

export type TelegramCallbackCtx<TMatch = TelegramCallbackMatch | undefined> = TelegramMessageCtx & {
  match: TMatch;

  answerCbQuery: (text?: string) => Promise<unknown>;
  editMessageText: (text: string, extra?: TelegramReplyOptions) => Promise<unknown>;
};

export type TelegramBotTelegramApi = {
  setMyCommands: (commands: Array<{ command: string; description: string }>) => Promise<unknown>;
  deleteWebhook: (args?: { drop_pending_updates?: boolean }) => Promise<unknown>;
  sendMessage: (chatId: string | number, text: string, extra?: TelegramReplyOptions) => Promise<unknown>;
  deleteMessage: (chatId: string | number, messageId: number) => Promise<unknown>;
  sendInvoice?: (
    chatId: string | number,
    title: string,
    description: string,
    payload: string,
    providerToken: string,
    currency: string,
    prices: Array<{ label: string; amount: number }>,
    extra?: TelegramReplyOptions,
  ) => Promise<unknown>;
};

export type TelegramBot = {
  telegram: TelegramBotTelegramApi;

  command: (command: string, handler: (ctx: TelegramMessageCtx) => Promise<unknown> | unknown) => unknown;
  action: {
    (trigger: RegExp, handler: (ctx: TelegramCallbackCtx<TelegramCallbackMatch>) => Promise<unknown> | unknown): unknown;
    (trigger: string, handler: (ctx: TelegramCallbackCtx) => Promise<unknown> | unknown): unknown;
  };
  on: {
    (event: 'text', handler: (ctx: TelegramMessageCtx & { message: TelegramMessage }) => Promise<unknown> | unknown): unknown;
    // Payment events (Telegram Bot Payments)
    (event: 'pre_checkout_query', handler: (ctx: any) => Promise<unknown> | unknown): unknown;
    (event: 'successful_payment', handler: (ctx: any) => Promise<unknown> | unknown): unknown;
  };
  catch: (handler: (err: unknown, ctx: TelegramMessageCtx) => unknown) => unknown;

  launch: () => Promise<unknown>;
  stop: () => Promise<unknown>;
};

