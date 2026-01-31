export type TelegramFrom = {
  id: string | number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type TelegramMessage = {
  text?: string;
};

export type TelegramReplyOptions = Record<string, unknown>;

export type TelegramMessageCtx = {
  from: TelegramFrom;
  message?: TelegramMessage;

  reply: (text: string, extra?: TelegramReplyOptions) => Promise<unknown>;
};

export type TelegramCallbackCtx = TelegramMessageCtx & {
  match?: any;

  answerCbQuery: (text?: string) => Promise<unknown>;
  editMessageText: (text: string, extra?: TelegramReplyOptions) => Promise<unknown>;
};

export type TelegramBotTelegramApi = {
  setMyCommands: (commands: Array<{ command: string; description: string }>) => Promise<unknown>;
  deleteWebhook: (args?: { drop_pending_updates?: boolean }) => Promise<unknown>;
  sendMessage: (chatId: string, text: string, extra?: TelegramReplyOptions) => Promise<unknown>;
};

export type TelegramBot = {
  telegram: TelegramBotTelegramApi;

  command: (command: string, handler: (ctx: TelegramMessageCtx) => Promise<unknown> | unknown) => unknown;
  action: (trigger: string | RegExp, handler: (ctx: TelegramCallbackCtx) => Promise<unknown> | unknown) => unknown;
  on: (event: 'text', handler: (ctx: TelegramMessageCtx & { message: TelegramMessage }) => Promise<unknown> | unknown) => unknown;
  catch: (handler: (err: unknown, ctx: TelegramMessageCtx) => unknown) => unknown;

  launch: () => Promise<unknown>;
  stop: () => Promise<unknown>;
};

