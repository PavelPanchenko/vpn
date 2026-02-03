const V2RAY_TUN_URL = 'https://v2raytun.com/';

/** Собирает HTML сообщения «Помощь» (подключение, приложения, команды). DRY для /help и кнопки в меню. */
export function buildHelpMessageHtml(): string {
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
