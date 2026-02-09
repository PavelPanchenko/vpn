const V2RAYTUN_ANDROID = 'https://play.google.com/store/apps/details?id=com.v2raytun.android';
const V2RAYTUN_IOS = 'https://apps.apple.com/en/app/v2raytun/id6476628951';
const V2RAYTUN_WINDOWS = 'https://storage.v2raytun.com/v2RayTun_Setup.exe';
const V2RAYTUN_MAC = 'https://apps.apple.com/us/app/v2raytun/id6476628951';
const V2RAYTUN_ANDROID_TV = V2RAYTUN_ANDROID;

/** Собирает HTML сообщения «Помощь» (подключение, приложения, команды). DRY для /help и кнопки в меню. */
export function buildHelpMessageHtml(lang: import('../i18n/bot-lang').BotLang): string {
  const appLinks =
    `<a href="${V2RAYTUN_ANDROID}">Android</a> | ` +
    `<a href="${V2RAYTUN_IOS}">iOS</a> | ` +
    `<a href="${V2RAYTUN_WINDOWS}">Windows</a> | ` +
    `<a href="${V2RAYTUN_MAC}">macOS</a> | ` +
    `<a href="${V2RAYTUN_ANDROID_TV}">Android TV</a>`;

  if (lang === 'en') {
    return (
      `❓ <b>Help</b>\n\n` +
      `<b>How to connect:</b>\n` +
      `1. Get config: <code>/config</code>\n` +
      `2. Choose "Link" (this device) or "QR" (another device)\n` +
      `3. Open V2RayTun, tap <b>+</b> → paste from clipboard or scan QR\n` +
      `4. Enable VPN — done!\n\n` +
      `<b>Download V2RayTun:</b>\n` +
      `${appLinks}\n\n` +
      `<b>Commands:</b>\n` +
      `<code>/start</code> — menu\n` +
      `<code>/config</code> — get config\n` +
      `/pay — payment\n` +
      `<code>/status</code> — subscription status\n` +
      `<code>/info</code> — info & documents\n` +
      `<code>/support</code> — support\n\n` +
      `If something doesn't work — message <code>/support</code>.`
    );
  }
  if (lang === 'uk') {
    return (
      `❓ <b>Допомога</b>\n\n` +
      `<b>Як підключитися:</b>\n` +
      `1. Отримайте конфіг: <code>/config</code>\n` +
      `2. Оберіть «Посилання» (цей пристрій) або «QR» (інший пристрій)\n` +
      `3. Відкрийте V2RayTun, натисніть <b>+</b> → вставте з буфера або скануйте QR\n` +
      `4. Увімкніть VPN — готово!\n\n` +
      `<b>Завантажити V2RayTun:</b>\n` +
      `${appLinks}\n\n` +
      `<b>Команди:</b>\n` +
      `<code>/start</code> — меню\n` +
      `<code>/config</code> — отримати конфіг\n` +
      `/pay — оплата\n` +
      `<code>/status</code> — статус підписки\n` +
      `<code>/info</code> — інформація і документи\n` +
      `<code>/support</code> — підтримка\n\n` +
      `Якщо щось не працює — напишіть у <code>/support</code>.`
    );
  }

  return (
    `❓ <b>Помощь</b>\n\n` +
    `<b>Как подключиться:</b>\n` +
    `1. Получите конфиг: <code>/config</code>\n` +
    `2. Выберите «Ссылка» (это устройство) или «QR» (другое устройство)\n` +
    `3. Откройте V2RayTun, нажмите <b>+</b> → вставьте из буфера или сканируйте QR\n` +
    `4. Включите VPN — готово!\n\n` +
    `<b>Скачать V2RayTun:</b>\n` +
    `${appLinks}\n\n` +
    `<b>Команды:</b>\n` +
    `<code>/start</code> — меню\n` +
    `<code>/config</code> — получить конфиг\n` +
    `/pay — оплата\n` +
    `<code>/status</code> — статус подписки\n` +
    `<code>/info</code> — информация и документы\n` +
    `<code>/support</code> — поддержка\n\n` +
    `Если что-то не работает — напишите в <code>/support</code>.`
  );
}
