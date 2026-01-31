export const BotMessages = {
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
    `Используйте /config для получения конфигурации VPN.\n` + `Используйте /pay для продления подписки.`,
  noPaidPlansCbText: '❌ Нет доступных тарифов',
  noPaidPlansHtml:
    `❌ <b>Нет доступных тарифов</b>\n\n` + `Попробуйте позже или напишите в поддержку: <code>/support</code>`,
  supportSendFailedText: '❌ Произошла ошибка при отправке сообщения. Попробуйте позже.',
  infoLoadFailedText: '❌ Не удалось загрузить информацию. Попробуйте позже.',
} as const;

