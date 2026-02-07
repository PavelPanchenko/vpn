import type { MiniLang } from './miniLang';

function pluralDaysRu(n: number): string {
  const x = Math.abs(n) % 100;
  const y = x % 10;
  if (x > 10 && x < 20) return 'дней';
  if (y > 1 && y < 5) return 'дня';
  if (y === 1) return 'день';
  return 'дней';
}

function pluralDaysUk(n: number): string {
  const x = Math.abs(n) % 100;
  const y = x % 10;
  if (x > 10 && x < 20) return 'днів';
  if (y > 1 && y < 5) return 'дні';
  if (y === 1) return 'день';
  return 'днів';
}

export function mm(lang: MiniLang) {
  const isEn = lang === 'en';
  const isUk = lang === 'uk';
  const daysWord = (n: number) => (isUk ? pluralDaysUk(n) : pluralDaysRu(n));
  return {
    common: {
      back: isEn ? 'Back' : isUk ? 'Назад' : 'Назад',
      refresh: isEn ? 'Refresh' : isUk ? 'Оновити' : 'Обновить',
      close: isEn ? 'Close' : isUk ? 'Закрити' : 'Закрыть',
      clear: isEn ? 'Clear' : isUk ? 'Очистити' : 'Очистить',
      continue: isEn ? 'Continue' : isUk ? 'Продовжити' : 'Продолжить',
      loadingDots: isEn ? 'Loading…' : isUk ? 'Завантаження…' : 'Загрузка…',
      paymentInProgress: isEn ? 'Paying…' : isUk ? 'Оплата…' : 'Оплата...',
    },
    home: {
      accountStatus: isEn ? 'Account status' : isUk ? 'Статус акаунта' : 'Статус аккаунта',
      statusNew: isEn ? '🆕 No subscription' : isUk ? '🆕 Без підписки' : '🆕 Без подписки',
      validUntil: isEn ? 'Valid until' : isUk ? 'Діє до' : 'Действует до',
      activeLocation: isEn ? 'Active location' : isUk ? 'Активна локація' : 'Активная локация',
      noActiveLocationHint: isEn
        ? 'You have no active location yet. Choose one below.'
        : isUk
          ? 'У вас поки немає активної локації. Оберіть її нижче.'
          : 'У вас пока нет активной локации. Выберите её ниже.',
      locationsTitle: isEn ? 'Locations' : isUk ? 'Локації' : 'Локации',
      locationsNotLoaded: isEn
        ? 'Locations are not loaded. Tap “Refresh”.'
        : isUk
          ? 'Локації не завантажені. Натисніть «Оновити».'
          : 'Локации не загружены. Нажмите «Обновить».',
      connecting: isEn ? 'Connecting…' : isUk ? 'Підключаємо…' : 'Подключаем…',
      activeBadge: isEn ? 'Active' : isUk ? 'Активна' : 'Активна',
      recommendedBadge: isEn ? 'Recommended' : isUk ? 'Рекомендуємо' : 'Рекомендуем',
      connectedBtn: isEn ? 'Connected' : isUk ? 'Підключено' : 'Подключено',
      tapToConnectBtn: isEn ? 'Tap to connect' : isUk ? 'Натисніть, щоб підключити' : 'Нажмите, чтобы подключить',
      slotsText: (n: number) => (isEn ? `slots: ${n}` : isUk ? `місць: ${n}` : `мест: ${n}`),
      configTitle: isEn ? 'Configuration' : isUk ? 'Конфігурація' : 'Конфигурация',
      getConfigBtn: isEn ? '📥 Get config' : isUk ? '📥 Отримати конфіг' : '📥 Получить конфиг',
      selectLocationFirst: isEn ? 'Select a location first.' : isUk ? 'Спочатку оберіть локацію.' : 'Сначала выберите локацию.',
      plansTitle: isEn ? 'Plans' : isUk ? 'Тарифи' : 'Тарифы',
      openBtn: isEn ? 'Open' : isUk ? 'Відкрити' : 'Открыть',
      plansHint: isEn ? 'Payment and renewal.' : isUk ? 'Оплата та продовження підписки.' : 'Оплата и продление подписки.',
      daysShort: (n: number | null) =>
        n == null ? '' : isEn ? `(${n} day(s))` : `(${n} ${daysWord(n)})`,
    },
    config: {
      title: isEn ? 'Configuration' : isUk ? 'Конфігурація' : 'Конфигурация',
      copyBtn: isEn ? '📋 Copy config' : isUk ? '📋 Скопіювати конфіг' : '📋 Копировать конфиг',
      copied: isEn ? '✓ Copied' : isUk ? '✓ Скопійовано' : '✓ Скопировано',
      notLoaded: isEn ? 'Config is not loaded.' : isUk ? 'Конфіг не завантажено.' : 'Конфиг не загружен.',
    },
    plans: {
      title: isEn ? 'Plans' : isUk ? 'Тарифи' : 'Тарифы',
      hintRefresh: isEn
        ? 'Tap “Refresh” to load available plans.'
        : isUk
          ? 'Натисніть «Оновити», щоб завантажити доступні тарифи.'
          : 'Нажмите «Обновить», чтобы загрузить доступные тарифы.',
      topPlan: isEn ? '⭐ Top plan' : isUk ? '⭐ Топ тариф' : '⭐ Топ тариф',
      payBtn: isEn ? 'Pay' : isUk ? 'Оплатити' : 'Оплатить',
      periodDays: (n: number) => (isEn ? `${n} day(s)` : `${n} ${daysWord(n)}`),
      paymentMethods: isEn ? 'Payment methods:' : isUk ? 'Способи оплати:' : 'Способы оплаты:',
      card: isEn ? 'Card' : isUk ? 'Картка' : 'Карта',
    },
    help: {
      title: isEn ? 'Help' : isUk ? 'Допомога' : 'Помощь',
      howToUseKey: isEn ? 'How to use the key' : isUk ? 'Як користуватися ключем' : 'Как пользоваться ключом',
      step1: isEn
        ? '1) Choose a location on the home screen.'
        : isUk
          ? '1) Оберіть локацію на головному екрані.'
          : '1) Выберите локацию на главном экране.',
      step2: isEn
        ? '2) Open “Configuration” and copy the key/link or scan QR.'
        : isUk
          ? '2) Відкрийте «Конфігурація» і скопіюйте ключ/посилання або відскануйте QR.'
          : '2) Откройте «Конфигурация» и скопируйте ключ/ссылку или отсканируйте QR.',
      step3: isEn
        ? '3) Import into your VPN app and enable connection.'
        : isUk
          ? "3) Імпортуйте в застосунок VPN та увімкніть підключення."
          : '3) Импортируйте в приложение VPN и включите подключение.',
      clientsHint: isEn
        ? 'Supported clients (example): iOS — Shadowrocket, Android — v2rayNG, Windows — v2rayN, macOS — ClashX.'
        : isUk
          ? 'Підтримувані клієнти (приклад): iOS — Shadowrocket, Android — v2rayNG, Windows — v2rayN, macOS — ClashX.'
          : 'Поддерживаемые клиенты (пример): iOS — Shadowrocket, Android — v2rayNG, Windows — v2rayN, macOS — ClashX.',
      contacts: isEn ? 'Contacts' : isUk ? 'Контакти' : 'Контакты',
      service: isEn ? 'Service' : isUk ? 'Сервіс' : 'Сервис',
      site: isEn ? 'Site' : isUk ? 'Сайт' : 'Сайт',
      contactsNotConfigured: isEn ? 'Contacts are not configured' : isUk ? 'Контакти не налаштовані' : 'Контакты не настроены',
      bot: isEn ? 'Bot' : isUk ? 'Бот' : 'Бот',
      v2rayTunGuide: isEn ? 'V2RayTun (guide):' : isUk ? 'V2RayTun (інструкція):' : 'V2RayTun (инструкция):',
    },
    footer: {
      privacy: isEn ? 'Privacy Policy' : isUk ? 'Політика конфіденційності' : 'Политика конфиденциальности',
      terms: isEn ? 'Terms of Service' : isUk ? 'Користувацька угода' : 'Пользовательское соглашение',
      help: isEn ? 'Help' : isUk ? 'Допомога' : 'Помощь',
    },
    fatal: {
      title: isEn ? 'Failed to load mini app.' : isUk ? 'Не вдалося завантажити міні‑застосунок.' : 'Не удалось загрузить мини‑приложение.',
      details: isEn ? 'Details' : 'Детали',
      hint: isEn
        ? 'Make sure you opened the app via the Telegram bot button. If opened in a browser — authorization will fail.'
        : isUk
          ? 'Перевірте, що ви відкрили застосунок через кнопку в Telegram‑боті. Якщо відкрито в браузері — авторизація не пройде.'
          : 'Проверьте, что вы открыли приложение через кнопку в Telegram‑боте. Если открыто в браузере — авторизация не пройдёт.',
      retry: isEn ? 'Retry' : isUk ? 'Повторити' : 'Повторить',
      close: isEn ? 'Close' : isUk ? 'Закрити' : 'Закрыть',
    },
    loading: {
      title: isEn ? 'Loading data…' : isUk ? 'Завантажуємо дані…' : 'Загружаем данные…',
      subtitle: isEn ? 'Usually it takes a couple seconds.' : isUk ? 'Зазвичай це займає кілька секунд.' : 'Обычно это занимает пару секунд.',
    },
    header: {
      subtitle: isEn
        ? 'Your VPN access and subscription right in Telegram.'
        : isUk
          ? 'Ваш доступ до VPN і підписки прямо в Telegram.'
          : 'Ваш доступ к VPN и подписке прямо в Telegram.',
    },
    standalone: {
      intro: isEn
        ? 'You opened Mini App in a regular browser. Telegram WebApp API is unavailable here, so automatic authorization will not work.'
        : isUk
          ? 'Ви відкрили Mini App у звичайному браузері. Telegram WebApp API тут недоступний, тому автоматична авторизація не спрацює.'
          : 'Вы открыли Mini App в обычном браузере. Telegram WebApp API здесь недоступен, поэтому автоматическая авторизация не сработает.',
      initDataLabel: isEn ? 'InitData (standalone mode)' : isUk ? 'InitData (standalone режим)' : 'InitData (для standalone режима)',
      initDataPlaceholder: isEn ? 'Paste initData (tgWebAppData) here' : isUk ? 'Вставте initData (tgWebAppData) сюди' : 'Вставьте initData (tgWebAppData) сюда',
      hint: isEn
        ? 'For users the correct way is to open the mini app from the Telegram bot. This screen is for testing the UI in a browser.'
        : isUk
          ? 'Для користувачів правильний шлях — відкрити міні‑застосунок із Telegram‑бота. Цей екран потрібен для тестів у браузері.'
          : 'Для обычных пользователей правильный путь — открыть мини‑приложение из Telegram‑бота. Этот экран нужен, чтобы можно было использовать UI как обычное web‑приложение (например, для тестов).',
    },
    paymentSheet: {
      titleChoose: isEn ? 'Choose payment method' : isUk ? 'Оберіть спосіб оплати' : 'Выберите способ оплаты',
      titlePayPrefix: isEn ? 'Payment:' : isUk ? 'Оплата:' : 'Оплата:',
      starsTitle: 'Telegram Stars',
      starsSubtitle: isEn ? 'Pay inside Telegram' : isUk ? 'Оплата всередині Telegram' : 'Оплата внутри Telegram',
      cardTitle: isEn ? 'Card / Instant' : isUk ? 'Картка / СБП' : 'Карта / СБП',
      cardSubtitle: isEn ? 'Open payment page' : isUk ? 'Перехід на сторінку оплати' : 'Переход на страницу оплаты',
      cryptoTitle: isEn ? 'Crypto' : isUk ? 'Крипто' : 'Крипто',
      cryptoSubtitle: isEn ? 'Pay via CryptoCloud' : isUk ? 'Оплата через CryptoCloud' : 'Оплата через CryptoCloud',
    },
    browserLogin: {
      intro: isEn
        ? 'Browser login is confirmed via the Telegram bot.'
        : isUk
          ? 'Вхід у браузері підтверджується через Telegram‑бота.'
          : 'Вход в браузере подтверждается через Telegram‑бота.',
      qrTitle: isEn ? 'Login via QR' : isUk ? 'Вхід через QR' : 'Вход через QR',
      qrHint: isEn
        ? 'Scan the QR to open the Telegram bot. Tap “Start” and login will be approved automatically.'
        : isUk
          ? 'Відскануйте QR — відкриється Telegram‑бот. Натисніть «Start», і вхід підтвердиться автоматично.'
          : 'Отсканируйте QR — откроется Telegram‑бот. Нажмите «Start», и вход подтвердится автоматически.',
      refreshQr: isEn ? 'Refresh QR' : isUk ? 'Оновити QR' : 'Обновить QR',
      botNotConfigured: isEn
        ? 'Bot is not configured (failed to get username). Configure an active bot in the admin panel and refresh the page.'
        : isUk
          ? 'Бот не налаштовано (не вдалося отримати username). Налаштуйте активного бота в адмінці й оновіть сторінку.'
          : 'Бот не настроен (не удалось получить username). Настройте активного бота в админке и обновите страницу.',
    },
    toasts: {
      statusLoadFailed: isEn ? 'Failed to load status.' : isUk ? 'Не вдалося завантажити статус.' : 'Не удалось загрузить статус.',
      statusRefreshFailed: isEn ? 'Failed to refresh status.' : isUk ? 'Не вдалося оновити статус.' : 'Не удалось обновить статус.',
      paymentSuccessStatusUpdated: isEn ? 'Payment successful. Status updated.' : isUk ? 'Оплату успішно завершено. Статус оновлено.' : 'Оплата прошла. Статус обновлён.',
      paymentNotCompleted: isEn ? 'Payment not completed.' : isUk ? 'Оплату не завершено.' : 'Оплата не завершена.',
      codeFailed: isEn ? 'Failed to get code' : isUk ? 'Не вдалося отримати код' : 'Не удалось получить код',
      configUnavailableChooseLocation: isEn
        ? 'Config is unavailable. Choose and activate a location first.'
        : isUk
          ? 'Конфіг недоступний. Спочатку оберіть і активуйте локацію.'
          : 'Конфигурация недоступна. Сначала выберите и активируйте локацию.',
      configLoadFailed: isEn ? 'Failed to load configuration.' : isUk ? 'Не вдалося отримати конфігурацію.' : 'Не удалось получить конфигурацию.',
      plansLoadFailed: isEn ? 'Failed to load plans.' : isUk ? 'Не вдалося завантажити тарифи.' : 'Не удалось загрузить тарифы.',
      serversLoadFailed: isEn ? 'Failed to load locations.' : isUk ? 'Не вдалося завантажити список локацій.' : 'Не удалось загрузить список локаций.',
      serverActivateFailed: isEn ? 'Failed to activate location.' : isUk ? 'Не вдалося активувати локацію.' : 'Не удалось активировать локацию.',
      sessionExpired: isEn
        ? 'Session expired. Close and open the app again.'
        : isUk
          ? 'Сесію завершено. Закрийте та відкрийте застосунок знову.'
          : 'Сессия истекла. Закройте и откройте приложение снова.',
      paymentTelegramOnly: isEn ? 'Payment is available only inside Telegram.' : isUk ? 'Оплата доступна лише всередині Telegram.' : 'Оплата доступна только внутри Telegram.',
      paymentSuccessExtended: isEn ? 'Payment successful. Subscription extended.' : isUk ? 'Оплату успішно завершено. Підписку продовжено.' : 'Оплата прошла. Подписка продлена.',
      paymentCancelled: isEn ? 'Payment cancelled.' : isUk ? 'Оплату скасовано.' : 'Оплата отменена.',
      paymentFailed: isEn ? 'Failed to complete payment.' : isUk ? 'Не вдалося виконати оплату.' : 'Не удалось выполнить оплату.',
      openingPaymentPage: isEn ? 'Opening payment page…' : isUk ? 'Відкриваємо сторінку оплати…' : 'Открываем страницу оплаты…',
      paymentMethodUnavailable: isEn
        ? 'This payment method is unavailable for the selected plan.'
        : isUk
          ? 'Цей спосіб оплати недоступний для вибраного тарифу.'
          : 'Этот способ оплаты недоступен для выбранного тарифа.',
      copyFailed: isEn ? 'Failed to copy' : isUk ? 'Не вдалося скопіювати' : 'Не удалось скопировать',
    },
  } as const;
}

