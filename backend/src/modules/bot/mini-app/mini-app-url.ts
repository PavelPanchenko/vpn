import type { ConfigService } from '@nestjs/config';

/**
 * URL Telegram Mini App (web_app button).
 * Важно: это не PUBLIC_SITE_URL/mini, а именно Telegram Mini App URL.
 */
export function getTelegramMiniAppUrl(config: ConfigService): string | null {
  const raw = config.get<string>('TELEGRAM_MINI_APP_URL') || '';
  const url = raw.trim();
  return url ? url : null;
}

