import type { BotLang } from '../i18n/bot-lang';

const BotMessagesByLang = {
  ru: {
    userNotFoundStartHtml: '❌ Пользователь не найден. Нажмите <code>/start</code> для регистрации.',
    userNotFoundUseStartText: '❌ Пользователь не найден. Используйте /start для регистрации.',
    userCreateFailedTryLaterText: '❌ Ошибка при создании пользователя. Попробуйте позже.',
    errorTryLaterText: '❌ Произошла ошибка. Попробуйте позже.',
    errorTryLaterOrAdminText: '❌ Произошла ошибка. Попробуйте позже или обратитесь к администратору.',
    userNotFoundCbText: '❌ Пользователь не найден',
    errorCbText: '❌ Произошла ошибка',
    serverUnavailableCbText: '❌ Сервер недоступен',
    loadInfoCbText: '❌ Ошибка при загрузке информации',
    connectLocationCbErrorText: '❌ Ошибка при подключении локации',
    paymentCreateCbErrorText: '❌ Ошибка при создании платежа',
    serversNoneText: '❌ Нет доступных серверов. Обратитесь к администратору.',
    cbProcessingText: '⏳ Обрабатываем...',
    cbConnectingLocationText: '⏳ Подключаем локацию...',
    planUnavailableText: '❌ Тариф недоступен или не найден.',
    locationConnectedHeaderText: '✅ Локация успешно подключена!',
    afterConnectHintText:
      `Что дальше:\n` +
      `1) Нажмите «📥 Получить конфиг» (или команда /config)\n` +
      `2) Импортируйте конфиг в приложение и включите VPN\n` +
      `3) Проверить статус: «📊 Статус подписки» (или /status)\n` +
      `4) Продлить/купить: «💳 Оплатить подписку» (или /pay)\n\n` +
      `ℹ️ Информация и документы: /info\n` +
      `❓ Помощь и инструкции: /help\n\n` +
      `Если что-то не работает — напишите в поддержку: /support`,
    noPaidPlansCbText: '❌ Нет доступных тарифов',
    noPaidPlansHtml:
      `❌ <b>Нет доступных тарифов</b>\n\n` + `Попробуйте позже или напишите в поддержку: <code>/support</code>`,
    supportSendFailedText: '❌ Произошла ошибка при отправке сообщения. Попробуйте позже.',
    infoLoadFailedText: '❌ Не удалось загрузить информацию. Попробуйте позже.',
    supportModeCancelledHtml:
      `✅ <b>Режим поддержки выключен</b>\n\n` + `Вернуться в меню: /start`,
    supportModeIntroHtml:
      `💬 <b>Поддержка</b>\n\n` +
      `Напишите ваш вопрос одним сообщением — мы ответим как можно скорее.\n\n` +
      `Выйти из режима: /cancel или /start`,
    supportReplyHeaderTemplate: '💬 <b>Ответ поддержки</b>\n\n{message}',
    supportMessageSentHtml:
      `✅ <b>Сообщение отправлено</b>\n\n` +
      `Если хотите добавить детали — отправьте ещё одно сообщение.\n` +
      `Выйти: /cancel или /start`,
    /** Напоминание об истечении за сутки. {date} — дата/время окончания. */
    expiryReminderTemplate: '⏰ <b>Напоминание</b>: подписка истекает через сутки (до {date}).\n\nПродлить: /pay',
    /** Уведомление при изменении срока доступа админом. {date} — новая дата окончания. */
    accessDaysChangedTemplate: '📅 <b>Срок доступа изменён</b>\n\nНовый срок действия: до {date}\n\nПроверить: /status',
    /** Уведомление при снятии срока доступа админом. */
    accessDaysRemovedText: '📅 <b>Срок доступа снят</b> администратором.\n\nПроверить статус: /status',
  },
  en: {
    userNotFoundStartHtml: '❌ User not found. Tap <code>/start</code> to register.',
    userNotFoundUseStartText: '❌ User not found. Use /start to register.',
    userCreateFailedTryLaterText: '❌ Failed to create user. Please try again later.',
    errorTryLaterText: '❌ Something went wrong. Please try again later.',
    errorTryLaterOrAdminText: '❌ Something went wrong. Try again later or contact support.',
    userNotFoundCbText: '❌ User not found',
    errorCbText: '❌ Error',
    serverUnavailableCbText: '❌ Server is unavailable',
    loadInfoCbText: '❌ Failed to load information',
    connectLocationCbErrorText: '❌ Failed to connect location',
    paymentCreateCbErrorText: '❌ Failed to create payment',
    serversNoneText: '❌ No available servers. Please contact admin.',
    cbProcessingText: '⏳ Processing...',
    cbConnectingLocationText: '⏳ Connecting location...',
    planUnavailableText: '❌ Plan is unavailable or not found.',
    locationConnectedHeaderText: '✅ Location connected!',
    afterConnectHintText:
      `Next steps:\n` +
      `1) Tap “📥 Get config” (or /config)\n` +
      `2) Import it into your app and enable VPN\n` +
      `3) Check status: “📊 Subscription status” (or /status)\n` +
      `4) Extend/buy: “💳 Pay” (or /pay)\n\n` +
      `ℹ️ Info & documents: /info\n` +
      `❓ Help & guides: /help\n\n` +
      `If something doesn’t work — contact support: /support`,
    noPaidPlansCbText: '❌ No available plans',
    noPaidPlansHtml: `❌ <b>No available plans</b>\n\n` + `Try again later or contact support: <code>/support</code>`,
    supportSendFailedText: '❌ Failed to send message. Please try again later.',
    infoLoadFailedText: '❌ Failed to load info. Please try again later.',
    supportModeCancelledHtml: `✅ <b>Support mode disabled</b>\n\n` + `Back to menu: /start`,
    supportModeIntroHtml:
      `💬 <b>Support</b>\n\n` +
      `Send your question in a single message — we’ll reply as soon as possible.\n\n` +
      `Exit: /cancel or /start`,
    supportReplyHeaderTemplate: '💬 <b>Support reply</b>\n\n{message}',
    supportMessageSentHtml:
      `✅ <b>Message sent</b>\n\n` +
      `If you want to add details — send another message.\n` +
      `Exit: /cancel or /start`,
    expiryReminderTemplate: '⏰ <b>Reminder</b>: your subscription expires in 24 hours (until {date}).\n\nExtend: /pay',
    accessDaysChangedTemplate: '📅 <b>Access period changed</b>\n\nNew expiry: {date}\n\nCheck: /status',
    accessDaysRemovedText: '📅 <b>Access period removed</b> by admin.\n\nCheck status: /status',
  },
  uk: {
    userNotFoundStartHtml: '❌ Користувача не знайдено. Натисніть <code>/start</code> для реєстрації.',
    userNotFoundUseStartText: '❌ Користувача не знайдено. Використайте /start для реєстрації.',
    userCreateFailedTryLaterText: '❌ Помилка створення користувача. Спробуйте пізніше.',
    errorTryLaterText: '❌ Сталася помилка. Спробуйте пізніше.',
    errorTryLaterOrAdminText: '❌ Сталася помилка. Спробуйте пізніше або зверніться до підтримки.',
    userNotFoundCbText: '❌ Користувача не знайдено',
    errorCbText: '❌ Помилка',
    serverUnavailableCbText: '❌ Сервер недоступний',
    loadInfoCbText: '❌ Помилка завантаження інформації',
    connectLocationCbErrorText: '❌ Помилка підключення локації',
    paymentCreateCbErrorText: '❌ Помилка створення платежу',
    serversNoneText: '❌ Немає доступних серверів. Зверніться до адміністратора.',
    cbProcessingText: '⏳ Обробляємо...',
    cbConnectingLocationText: '⏳ Підключаємо локацію...',
    planUnavailableText: '❌ Тариф недоступний або не знайдений.',
    locationConnectedHeaderText: '✅ Локацію успішно підключено!',
    afterConnectHintText:
      `Що далі:\n` +
      `1) Натисніть «📥 Отримати конфіг» (або /config)\n` +
      `2) Імпортуйте конфіг у застосунок та увімкніть VPN\n` +
      `3) Перевірити статус: «📊 Статус підписки» (або /status)\n` +
      `4) Подовжити/купити: «💳 Оплатити підписку» (або /pay)\n\n` +
      `ℹ️ Інформація і документи: /info\n` +
      `❓ Допомога та інструкції: /help\n\n` +
      `Якщо щось не працює — напишіть у підтримку: /support`,
    noPaidPlansCbText: '❌ Немає доступних тарифів',
    noPaidPlansHtml: `❌ <b>Немає доступних тарифів</b>\n\n` + `Спробуйте пізніше або напишіть у підтримку: <code>/support</code>`,
    supportSendFailedText: '❌ Помилка надсилання повідомлення. Спробуйте пізніше.',
    infoLoadFailedText: '❌ Не вдалося завантажити інформацію. Спробуйте пізніше.',
    supportModeCancelledHtml: `✅ <b>Режим підтримки вимкнено</b>\n\n` + `Повернутися в меню: /start`,
    supportModeIntroHtml:
      `💬 <b>Підтримка</b>\n\n` +
      `Напишіть ваше питання одним повідомленням — ми відповімо якнайшвидше.\n\n` +
      `Вийти: /cancel або /start`,
    supportReplyHeaderTemplate: '💬 <b>Відповідь підтримки</b>\n\n{message}',
    supportMessageSentHtml:
      `✅ <b>Повідомлення надіслано</b>\n\n` +
      `Якщо хочете додати деталі — надішліть ще одне повідомлення.\n` +
      `Вийти: /cancel або /start`,
    expiryReminderTemplate: '⏰ <b>Нагадування</b>: підписка закінчується через добу (до {date}).\n\nПодовжити: /pay',
    accessDaysChangedTemplate: '📅 <b>Термін доступу змінено</b>\n\nНовий термін: до {date}\n\nПеревірити: /status',
    accessDaysRemovedText: '📅 <b>Термін доступу знято</b> адміністратором.\n\nПеревірити статус: /status',
  },
} as const;

export function bm(lang: BotLang) {
  return (BotMessagesByLang as any)[lang] ?? BotMessagesByLang.ru;
}

/** Тексты и подписи оплаты — меняйте здесь, чтобы править кнопки и сообщения в потоке оплаты. */
const PaymentMessagesByLang = {
  ru: {
    billSentStarsTemplate: '💳 Счёт отправлен.\n\nОплатите <b>{price}</b> XTR, затем подписка активируется автоматически.',
    plategaInstructionsHtml:
      `💳 <b>Оплата картой / СБП</b>\n\n` +
      `1) Нажмите «Открыть оплату»\n` +
      `2) Оплатите\n` +
      `3) После оплаты подписка активируется автоматически.`,
    openPaymentButtonLabel: 'Открыть оплату',
    invoiceTitleTemplate: 'VPN — {planName}',
    invoiceDescriptionTemplate: 'Подписка на {periodDays} дн.',
    starsSubscriptionScreenTemplate:
      `📋 <b>Тариф</b>: {planName}\n\n` +
      `⏱ <b>Срок</b>: подписка на {periodDays} дн.\n\n` +
      `💫 <b>Сумма</b>: {price} XTR (Stars)\n\n` +
      `Нажмите кнопку ниже, чтобы открыть счёт и оплатить. После оплаты подписка активируется автоматически.`,
    starsPayButtonLabel: 'Заплатить ⭐{price}',
    paymentSuccessBotText: '✅ Оплата прошла, статус обновился.',
  },
  en: {
    billSentStarsTemplate: '💳 Invoice sent.\n\nPay <b>{price}</b> XTR, then your subscription will activate automatically.',
    plategaInstructionsHtml:
      `💳 <b>Card / Instant payment</b>\n\n` +
      `1) Tap “Open payment”\n` +
      `2) Pay\n` +
      `3) After payment the subscription will activate automatically.`,
    openPaymentButtonLabel: 'Open payment',
    invoiceTitleTemplate: 'VPN — {planName}',
    invoiceDescriptionTemplate: 'Subscription for {periodDays} days.',
    starsSubscriptionScreenTemplate:
      `📋 <b>Plan</b>: {planName}\n\n` +
      `⏱ <b>Period</b>: {periodDays} days\n\n` +
      `💫 <b>Amount</b>: {price} XTR (Stars)\n\n` +
      `Tap the button below to open the invoice and pay. After payment the subscription will activate automatically.`,
    starsPayButtonLabel: 'Pay ⭐{price}',
    paymentSuccessBotText: '✅ Payment successful, status updated.',
  },
  uk: {
    billSentStarsTemplate: '💳 Рахунок надіслано.\n\nСплатіть <b>{price}</b> XTR, після чого підписка активується автоматично.',
    plategaInstructionsHtml:
      `💳 <b>Оплата карткою / СБП</b>\n\n` +
      `1) Натисніть «Відкрити оплату»\n` +
      `2) Сплатіть\n` +
      `3) Після оплати підписка активується автоматично.`,
    openPaymentButtonLabel: 'Відкрити оплату',
    invoiceTitleTemplate: 'VPN — {planName}',
    invoiceDescriptionTemplate: 'Підписка на {periodDays} дн.',
    starsSubscriptionScreenTemplate:
      `📋 <b>Тариф</b>: {planName}\n\n` +
      `⏱ <b>Термін</b>: підписка на {periodDays} дн.\n\n` +
      `💫 <b>Сума</b>: {price} XTR (Stars)\n\n` +
      `Натисніть кнопку нижче, щоб відкрити рахунок і сплатити. Після оплати підписка активується автоматично.`,
    starsPayButtonLabel: 'Сплатити ⭐{price}',
    paymentSuccessBotText: '✅ Оплату успішно завершено, статус оновлено.',
  },
} as const;

export function pm(lang: BotLang) {
  return (PaymentMessagesByLang as any)[lang] ?? PaymentMessagesByLang.ru;
}

