import type { ConfigService } from '@nestjs/config';
import type { BotLang } from '../i18n/bot-lang';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Собирает HTML сообщения «Информация» (документы, контакты). DRY для /info и кнопки в меню. */
export function buildInfoMessageHtml(lang: BotLang, config: ConfigService): string {
  const siteUrlRaw = config.get<string>('PUBLIC_SITE_URL') || '';
  const siteUrl = siteUrlRaw.replace(/\/+$/, '');

  const privacyUrl = siteUrl ? `${siteUrl}/privacy` : null;
  const termsUrl = siteUrl ? `${siteUrl}/terms` : null;

  const supportEmail = config.get<string>('PUBLIC_SUPPORT_EMAIL') || null;
  const supportTelegram = config.get<string>('PUBLIC_SUPPORT_TELEGRAM') || null;

  let msg =
    lang === 'en'
      ? 'ℹ️ <b>Information</b>\n\n'
      : lang === 'uk'
        ? 'ℹ️ <b>Інформація</b>\n\n'
        : 'ℹ️ <b>Информация</b>\n\n';
  msg += lang === 'en' ? '• Documents:\n' : lang === 'uk' ? '• Документи:\n' : '• Документы:\n';
  if (privacyUrl) {
    msg += `  • <a href="${privacyUrl}">${
      lang === 'en' ? 'Privacy Policy' : lang === 'uk' ? 'Політика конфіденційності' : 'Политика конфиденциальности'
    }</a>\n`;
  } else {
    const label = lang === 'en' ? 'Privacy Policy' : lang === 'uk' ? 'Політика конфіденційності' : 'Политика конфиденциальности';
    const tail = lang === 'en' ? 'not configured' : lang === 'uk' ? 'не налаштовано' : 'не настроено';
    msg += `  • ${label} — ${tail}\n`;
  }
  if (termsUrl) {
    msg += `  • <a href="${termsUrl}">${
      lang === 'en' ? 'Terms of Service' : lang === 'uk' ? 'Користувацька угода' : 'Пользовательское соглашение'
    }</a>\n\n`;
  } else {
    const label = lang === 'en' ? 'Terms of Service' : lang === 'uk' ? 'Користувацька угода' : 'Пользовательское соглашение';
    const tail = lang === 'en' ? 'not configured' : lang === 'uk' ? 'не налаштовано' : 'не настроено';
    msg += `  • ${label} — ${tail}\n\n`;
  }
  msg += lang === 'en' ? '• Contacts:\n' : lang === 'uk' ? '• Контакти:\n' : '• Контакты:\n';
  if (supportTelegram) {
    const tgUser = supportTelegram.replace(/^@/, '');
    msg += `  • Telegram: <a href="tg://resolve?domain=${escapeHtml(tgUser)}">${escapeHtml(supportTelegram)}</a>\n`;
  }
  if (supportEmail) {
    msg += `  • Email: <a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a>\n`;
  }
  if (!supportTelegram && !supportEmail) msg += `  • ${lang === 'en' ? 'not configured' : 'не налаштовано'}\n`;

  return msg;
}
