export async function callTelegramBotApi<T>(args: {
  token: string;
  method: string;
  payload: Record<string, unknown>;
}): Promise<T> {
  const url = `https://api.telegram.org/bot${args.token}/${args.method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args.payload),
  });
  const json = (await res.json()) as { ok?: boolean; result?: T; description?: string };
  if (!json?.ok) {
    throw new Error(json?.description || `Telegram API ${args.method} failed`);
  }
  return json.result as T;
}

export type TelegramLabeledPrice = { label: string; amount: number };

export async function createTelegramStarsInvoiceLink(args: {
  token: string;
  title: string;
  description: string;
  payload: string;
  currency: 'XTR';
  prices: TelegramLabeledPrice[];
}): Promise<string> {
  // For Stars (digital goods) provider_token may be empty string.
  return await callTelegramBotApi<string>({
    token: args.token,
    method: 'createInvoiceLink',
    payload: {
      title: args.title,
      description: args.description,
      payload: args.payload,
      provider_token: '',
      currency: args.currency,
      prices: args.prices,
    },
  });
}

export async function sendTelegramStarsInvoice(args: {
  token: string;
  chatId: string | number;
  title: string;
  description: string;
  payload: string;
  currency: 'XTR';
  prices: TelegramLabeledPrice[];
  startParameter?: string;
}): Promise<unknown> {
  // start_parameter обязателен для sendInvoice. Делаем короткий уникальный параметр,
  // чтобы Telegram мог валидировать deeplink/invoice.
  const startParameter = args.startParameter || `vpn_${Date.now()}`;

  return await callTelegramBotApi({
    token: args.token,
    method: 'sendInvoice',
    payload: {
      chat_id: args.chatId,
      title: args.title,
      description: args.description,
      payload: args.payload,
      provider_token: '',
      start_parameter: startParameter,
      currency: args.currency,
      prices: args.prices,
    },
  });
}

