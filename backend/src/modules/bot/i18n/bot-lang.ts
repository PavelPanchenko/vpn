export type BotLang = 'ru' | 'en' | 'uk';

export function botLangFromTelegram(languageCode: string | undefined | null): BotLang {
  const code = String(languageCode ?? '').toLowerCase();
  // Telegram обычно присылает 'ru', 'en', 'uk', 'de', ...
  // Для СНГ/русскоязычных локалей показываем русский, иначе английский (fallback).
  if (code.startsWith('ru') || code.startsWith('be') || code.startsWith('kk')) return 'ru';
  if (code.startsWith('uk')) return 'uk';
  if (code.startsWith('en')) return 'en';
  return 'en';
}

export function extractTelegramLanguageCode(ctx: unknown): string | null {
  const c: any = ctx as any;
  const code =
    c?.from?.language_code ??
    c?.message?.from?.language_code ??
    c?.callbackQuery?.from?.language_code ??
    c?.preCheckoutQuery?.from?.language_code ??
    c?.update?.message?.from?.language_code ??
    c?.update?.callback_query?.from?.language_code ??
    c?.update?.pre_checkout_query?.from?.language_code ??
    null;
  const s = String(code ?? '').trim();
  return s ? s : null;
}

export function botLangFromCtx(ctx: unknown): BotLang {
  return botLangFromTelegram(extractTelegramLanguageCode(ctx));
}

