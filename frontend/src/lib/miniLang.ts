export type MiniLang = 'ru' | 'en' | 'uk';

export function miniLangFromTelegram(languageCode: string | null | undefined): MiniLang {
  const code = String(languageCode ?? '').toLowerCase();
  // Для СНГ/русскоязычных локалей используем русский, иначе английский.
  if (code.startsWith('ru') || code.startsWith('be') || code.startsWith('kk')) return 'ru';
  if (code.startsWith('uk')) return 'uk';
  if (code.startsWith('en')) return 'en';
  return 'en';
}

function parseUserFromInitData(initData: string): any | null {
  try {
    const params = new URLSearchParams(String(initData ?? ''));
    const raw = params.get('user');
    if (!raw) return null;
    // user обычно urlencoded JSON
    const jsonStr = raw.includes('%') ? decodeURIComponent(raw) : raw;
    const user = JSON.parse(jsonStr);
    return user && typeof user === 'object' ? user : null;
  } catch {
    return null;
  }
}

export function extractMiniLanguageCode(args: { tg: unknown; initData: string }): string | null {
  const { tg, initData } = args;

  // 1) Telegram WebApp API (если доступно)
  const unsafe = (tg as any)?.initDataUnsafe;
  const codeFromUnsafe = unsafe?.user?.language_code ?? null;
  if (codeFromUnsafe) return String(codeFromUnsafe);

  // 2) Парсим initData как querystring (user=<json>)
  const user = parseUserFromInitData(initData);
  const codeFromInitData = user?.language_code ?? null;
  if (codeFromInitData) return String(codeFromInitData);

  return null;
}

