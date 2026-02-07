import type { BotLang } from '../i18n/bot-lang';

const UiMessagesByLang = {
  ru: {
    backToMenuBtn: '🏠 В меню',
    qrBtn: '📱 QR-код',
    linkBtn: '🔗 Ссылка',
    preparingQrText: '⏳ Готовлю QR…',
    qrFailedText: '⚠️ Не удалось сгенерировать QR. Нажмите «Ссылка» или «В меню».',
  },
  en: {
    backToMenuBtn: '🏠 Menu',
    qrBtn: '📱 QR code',
    linkBtn: '🔗 Link',
    preparingQrText: '⏳ Preparing QR…',
    qrFailedText: '⚠️ Failed to generate QR. Tap “Link” or “Menu”.',
  },
  uk: {
    backToMenuBtn: '🏠 Меню',
    qrBtn: '📱 QR-код',
    linkBtn: '🔗 Посилання',
    preparingQrText: '⏳ Готую QR…',
    qrFailedText: '⚠️ Не вдалося згенерувати QR. Натисніть «Посилання» або «Меню».',
  },
} as const;

export function ui(lang: BotLang) {
  return (UiMessagesByLang as any)[lang] ?? UiMessagesByLang.ru;
}

