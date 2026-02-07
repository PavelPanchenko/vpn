const V2RAY_TUN_URL = 'https://v2raytun.com/';

/** Собирает HTML сообщения «Помощь» (подключение, приложения, команды). DRY для /help и кнопки в меню. */
export function buildHelpMessageHtml(lang: import('../i18n/bot-lang').BotLang): string {
  if (lang === 'en') {
    return (
      `❓ <b>Help</b>\n\n` +
      `<b>1) Connect</b>\n` +
      `• Get config: <code>/config</code>\n` +
      `• Import into your app and enable VPN\n\n` +
      `<b>2) Recommended apps</b>\n` +
      `• iOS: Shadowrocket / v2rayNG\n` +
      `• Android: v2rayNG / V2RayTun\n` +
      `• Windows: v2rayN\n` +
      `• macOS: ClashX\n\n` +
      `<b>3) V2RayTun guide</b>\n` +
      `• ${V2RAY_TUN_URL}\n\n` +
      `<b>4) Commands</b>\n` +
      `• <code>/start</code> — menu\n` +
      `• <code>/config</code> — config\n` +
      `• <code>/pay</code> — payment\n` +
      `• <code>/status</code> — status\n` +
      `• <code>/info</code> — info & documents\n` +
      `• <code>/help</code> — help\n` +
      `• <code>/support</code> — support\n\n` +
      `If something doesn’t work — message <code>/support</code>.`
    );
  }
  if (lang === 'uk') {
    return (
      `❓ <b>Допомога</b>\n\n` +
      `<b>1) Підключення</b>\n` +
      `• Отримайте конфіг: <code>/config</code>\n` +
      `• Імпортуйте у застосунок та увімкніть VPN\n\n` +
      `<b>2) Рекомендовані застосунки</b>\n` +
      `• iOS: Shadowrocket / v2rayNG\n` +
      `• Android: v2rayNG / V2RayTun\n` +
      `• Windows: v2rayN\n` +
      `• macOS: ClashX\n\n` +
      `<b>3) Інструкція для V2RayTun</b>\n` +
      `• ${V2RAY_TUN_URL}\n\n` +
      `<b>4) Команди</b>\n` +
      `• <code>/start</code> — меню\n` +
      `• <code>/config</code> — конфіг\n` +
      `• <code>/pay</code> — оплата\n` +
      `• <code>/status</code> — статус\n` +
      `• <code>/info</code> — інформація і документи\n` +
      `• <code>/help</code> — допомога та інструкції\n` +
      `• <code>/support</code> — підтримка\n\n` +
      `Якщо щось не працює — напишіть у <code>/support</code>.`
    );
  }

  return (
    `❓ <b>Помощь</b>\n\n` +
    `<b>1) Подключение</b>\n` +
    `• Получите конфиг: <code>/config</code>\n` +
    `• Импортируйте в приложение и включите VPN\n\n` +
    `<b>2) Рекомендуемые приложения</b>\n` +
    `• iOS: Shadowrocket / v2rayNG\n` +
    `• Android: v2rayNG / V2RayTun\n` +
    `• Windows: v2rayN\n` +
    `• macOS: ClashX\n\n` +
    `<b>3) Инструкция для V2RayTun</b>\n` +
    `• ${V2RAY_TUN_URL}\n\n` +
    `<b>4) Команды</b>\n` +
    `• <code>/start</code> — меню\n` +
    `• <code>/config</code> — конфиг\n` +
    `• <code>/pay</code> — оплата\n` +
    `• <code>/status</code> — статус\n` +
    `• <code>/info</code> — информация и документы\n` +
    `• <code>/help</code> — помощь и инструкции\n` +
    `• <code>/support</code> — поддержка\n\n` +
    `Если что-то не работает — напишите в <code>/support</code>.`
  );
}
