import type { ConfigService } from '@nestjs/config';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Собирает HTML сообщения «Информация» (документы, контакты). DRY для /info и кнопки в меню. */
export function buildInfoMessageHtml(config: ConfigService): string {
  const siteUrlRaw = config.get<string>('PUBLIC_SITE_URL') || '';
  const siteUrl = siteUrlRaw.replace(/\/+$/, '');

  const privacyUrl = siteUrl ? `${siteUrl}/privacy` : null;
  const termsUrl = siteUrl ? `${siteUrl}/terms` : null;

  const supportEmail = config.get<string>('PUBLIC_SUPPORT_EMAIL') || null;
  const supportTelegram = config.get<string>('PUBLIC_SUPPORT_TELEGRAM') || null;

  let msg = 'ℹ️ <b>Информация</b>\n\n';
  msg += '• Документы:\n';
  if (privacyUrl) {
    msg += `  • <a href="${privacyUrl}">Политика конфиденциальности</a>\n`;
  } else {
    msg += '  • Политика конфиденциальности — не настроено\n';
  }
  if (termsUrl) {
    msg += `  • <a href="${termsUrl}">Пользовательское соглашение</a>\n\n`;
  } else {
    msg += '  • Пользовательское соглашение — не настроено\n\n';
  }
  msg += '• Контакты:\n';
  if (supportTelegram) {
    const tgUser = supportTelegram.replace(/^@/, '');
    msg += `  • Telegram: <a href="tg://resolve?domain=${escapeHtml(tgUser)}">${escapeHtml(supportTelegram)}</a>\n`;
  }
  if (supportEmail) {
    msg += `  • Email: <a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a>\n`;
  }
  if (!supportTelegram && !supportEmail) msg += '  • не настроено\n';

  return msg;
}
