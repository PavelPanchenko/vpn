import type { TelegramRegistrarDeps } from './telegram-registrar.deps';
import { bm } from '../messages/common.messages';
import { getMarkup } from '../telegram-markup.utils';
import { cbThenReplyText } from '../telegram-callback.utils';
import type { TelegramCallbackCtx, TelegramCallbackMatch, TelegramMessageCtx } from '../telegram-runtime.types';
import type { ServerLike } from '../bot-domain.types';

import { botLangFromCtx, extractTelegramLanguageCode } from '../i18n/bot-lang';
import { ui } from '../messages/ui.messages';

export function registerOnboardingHandlers(args: TelegramRegistrarDeps) {
  // /start
  args.bot.command('start', async (ctx: TelegramMessageCtx) => {
    const telegramId = ctx.from.id.toString();
    const lang = botLangFromCtx(ctx);
    const languageCode = extractTelegramLanguageCode(ctx);
    void args.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, languageCode);
    args.logger.log(`Telegram /start lang: telegramId=${telegramId} language_code=${languageCode ?? 'null'} resolved=${lang}`);
    // Выходим из режима поддержки при /start
    args.supportModeUsers.delete(telegramId);
    const userName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || ctx.from.username || 'User';
    const startText = String((ctx.message as any)?.text ?? '');
    const startPayload = startText.startsWith('/start') ? startText.replace(/^\/start\s*/i, '').trim() : '';

    try {
      const user = await args.usersService.getOrCreateByTelegramId(telegramId, userName, {
        userServers: true,
      });

      if (!user) {
        await ctx.reply(bm(lang).userCreateFailedTryLaterText);
        return;
      }

      // Web login approve via deep-link payload: /start web_<6digits>
      if (startPayload) {
        const m = startPayload.match(/^web_(\d{6})$/);
        const code = m?.[1] ?? null;
        if (code) {
          const session = await (args.prisma as any).browserLoginSession.findFirst({
            where: { code, status: 'PENDING', expiresAt: { gt: new Date() } },
          });
          if (session) {
            await (args.prisma as any).browserLoginSession.update({
              where: { id: session.id },
              data: { status: 'APPROVED', telegramId, vpnUserId: user.id, approvedAt: new Date() },
            });
            await args.replyHtml(
              ctx,
              lang === 'en'
                ? `✅ Browser login confirmed.\n\nReturn to the page — you’ll be logged in automatically.`
                : `✅ Вход в браузере подтверждён.\n\nВернитесь на страницу — вход выполнится автоматически.`,
            );
            return;
          }
          await args.replyHtml(
            ctx,
            lang === 'en'
              ? `⚠️ QR code expired. Refresh the Mini App page in the browser and scan the new QR.`
              : `⚠️ QR‑код истёк. Обновите страницу Mini App в браузере и отсканируйте новый QR.`,
          );
          return;
        }
      }

      // Если у пользователя уже есть сервер - показываем главное меню
      if (user.serverId || (user.userServers && user.userServers.length > 0)) {
        await args.showMainMenu(ctx, user);
        return;
      }

      // Показываем выбор локации
      const servers = await args.prisma.vpnServer.findMany({
        where: { active: true },
        orderBy: { createdAt: 'desc' },
      });

      if (servers.length === 0) {
        await ctx.reply(bm(lang).serversNoneText);
        return;
      }

      const Markup = await getMarkup();
      const buttons = servers.map((server: ServerLike) => {
        return [{ text: server.name, callback_data: `select_server_${server.id}` }];
      });
      const miniAppUrl = await args.getTelegramMiniAppUrl();
      if (miniAppUrl) {
        const btn = Markup?.button?.webApp
          ? Markup.button.webApp(lang === 'en' ? '🚀 Open Mini App' : '🚀 Открыть Mini App', miniAppUrl)
          : Markup.button.url(lang === 'en' ? '🚀 Open Mini App' : '🚀 Открыть Mini App', miniAppUrl);
        buttons.push([btn]);
      }

      const trialDays = await args.getTrialDaysForUser(user.id);
      const recommended = servers.find((s: ServerLike) => s.isRecommended);
      const recommendLine = recommended
        ? lang === 'en'
          ? `\n\n💡 We recommend: <b>${args.esc(recommended.name)}</b>`
          : `\n\n💡 Рекомендуем: <b>${args.esc(recommended.name)}</b>`
        : '';

      await args.replyHtml(
        ctx,
        lang === 'en'
          ? `👋 Hi, <b>${args.esc(userName)}</b>!\n\n` +
              `1) Choose a location\n` +
              `2) Get config and import into the app\n` +
              `3) Enable VPN\n\n` +
              `🎁 After first connection — trial period <b>${args.esc(trialDays)} day(s)</b>` +
              recommendLine
          : `👋 Привет, <b>${args.esc(userName)}</b>!\n\n` +
              `1) Выберите локацию\n` +
              `2) Получите конфиг и импортируйте в приложение\n` +
              `3) Включите VPN\n\n` +
              `🎁 После первого подключения — пробный период <b>${args.esc(trialDays)} дн.</b>` +
              recommendLine,
        Markup.inlineKeyboard(buttons),
      );
    } catch (error: unknown) {
      args.logger.error('Error handling /start command:', error);
      await ctx.reply(bm(lang).errorTryLaterText);
    }
  });

  // Выбор сервера -> показать инфо и тарифы
  args.bot.action(/^select_server_(.+)$/, async (ctx: TelegramCallbackCtx<TelegramCallbackMatch>) => {
    const serverId = ctx.match[1];
    const telegramId = ctx.from.id.toString();
    const userName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || ctx.from.username || 'User';
    const lang = botLangFromCtx(ctx);
    void args.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, extractTelegramLanguageCode(ctx));

    try {
      const user = await args.usersService.getOrCreateByTelegramId(telegramId, userName);

      // Проверяем, не добавлен ли уже этот сервер
      const existingUserServer = await args.prisma.userServer.findFirst({
        where: { vpnUserId: user.id, serverId },
        include: { server: true },
      });

      if (existingUserServer) {
        if (existingUserServer.isActive) {
          await ctx.answerCbQuery(
            lang === 'en' ? 'This location is already active!'
              : lang === 'uk' ? 'Ця локація вже активна!'
              : 'Эта локация уже активна!',
          );
          await args.showMainMenuEdit(ctx, user);
          return;
        }
        await ctx.answerCbQuery();
        const confirmText = bm(lang).switchLocationConfirmText.replace('{name}', args.esc(existingUserServer.server.name));
        const Markup = await getMarkup();
        const buttons = [
          [Markup.button.callback(
            lang === 'en' ? '✅ Confirm switch' : lang === 'uk' ? '✅ Підтвердити перемикання' : '✅ Подтвердить переключение',
            `confirm_switch_server_${serverId}`,
          )],
          [Markup.button.callback(
            lang === 'en' ? '🔙 Choose another location' : lang === 'uk' ? '🔙 Обрати іншу локацію' : '🔙 Выбрать другую локацию',
            'back_to_servers',
          )],
          [Markup.button.callback(ui(lang).backToMenuBtn, 'back_to_main')],
        ];
        await args.editHtml(ctx, confirmText, Markup.inlineKeyboard(buttons));
        return;
      }

      // Проверяем сервер
      const server = await args.prisma.vpnServer.findUnique({ where: { id: serverId } });

      if (!server || !server.active) {
        await ctx.answerCbQuery(bm(lang).serverUnavailableCbText);
        return;
      }

      await ctx.answerCbQuery();

      const trialDays = await args.getTrialDaysForUser(user.id);

      const currentActive = await args.prisma.userServer.findFirst({
        where: { vpnUserId: user.id, isActive: true },
        include: { server: true },
      });

      let message = `📍 <b>${args.esc(server.name)}</b>\n\n`;

      if (currentActive) {
        message += lang === 'en'
          ? `⚠️ Current location <b>${args.esc(currentActive.server.name)}</b> will be deactivated.\n`
          : lang === 'uk'
            ? `⚠️ Поточна локація <b>${args.esc(currentActive.server.name)}</b> буде вимкнена.\n`
            : `⚠️ Текущая локация <b>${args.esc(currentActive.server.name)}</b> будет отключена.\n`;
      } else {
        message += lang === 'en'
          ? `🎁 Trial access: <b>${args.esc(trialDays)} day(s)</b>\n`
          : `🎁 Пробний доступ: <b>${args.esc(trialDays)} дн.</b>\n`;
      }

      const Markup = await getMarkup();
      const buttons = [
        [Markup.button.callback(
          lang === 'en' ? '✅ Confirm & connect' : lang === 'uk' ? '✅ Підтвердити і підключити' : '✅ Подтвердить и подключить',
          `confirm_server_${serverId}`,
        )],
        [Markup.button.callback(
          lang === 'en' ? '🔙 Choose another location' : lang === 'uk' ? '🔙 Обрати іншу локацію' : '🔙 Выбрать другую локацию',
          'back_to_servers',
        )],
        [Markup.button.callback(ui(lang).backToMenuBtn, 'back_to_main')],
      ];

      await args.editHtml(ctx, message, Markup.inlineKeyboard(buttons));
    } catch (error: unknown) {
      args.logger.error('Error handling server selection:', error);
      await cbThenReplyText({ ctx, cbText: bm(lang).loadInfoCbText, replyText: bm(lang).errorTryLaterText });
    }
  });

  // Подтверждение переключения на уже добавленную локацию
  args.bot.action(/^confirm_switch_server_(.+)$/, async (ctx: TelegramCallbackCtx<TelegramCallbackMatch>) => {
    const serverId = ctx.match[1];
    const telegramId = ctx.from.id.toString();
    const lang = botLangFromCtx(ctx);
    void args.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, extractTelegramLanguageCode(ctx));

    try {
      const user = await args.usersService.findByTelegramId(telegramId);
      if (!user) {
        await ctx.answerCbQuery(bm(lang).userNotFoundCbText);
        return;
      }

      const existingUserServer = await args.prisma.userServer.findFirst({
        where: { vpnUserId: user.id, serverId },
        include: { server: true },
      });
      if (!existingUserServer || existingUserServer.isActive) {
        await ctx.answerCbQuery(bm(lang).loadInfoCbText);
        await args.showMainMenuEdit(ctx, user);
        return;
      }

      await args.usersService.activateServer(user.id, serverId);
      const alertText = bm(lang).switchLocationAlertText.replace('{name}', existingUserServer.server.name);
      await ctx.answerCbQuery(alertText, { show_alert: true });

      const successText =
        `${bm(lang).locationConnectedHeaderText}\n\n` +
        `${lang === 'en' ? '📍 Location' : lang === 'uk' ? '📍 Локація' : '📍 Локация'}: <b>${args.esc(existingUserServer.server.name)}</b>\n\n` +
        (lang === 'en'
          ? `🔄 Get a new config and update it in your VPN app.`
          : lang === 'uk'
            ? `🔄 Отримайте новий конфіг та оновіть його у VPN-застосунку.`
            : `🔄 Получите новый конфиг и обновите его в VPN-приложении.`);

      const Markup = await getMarkup();
      const successButtons = [
        [Markup.button.callback(
          lang === 'en' ? '📥 Get config' : lang === 'uk' ? '📥 Отримати конфіг' : '📥 Получить конфиг',
          'get_config',
        )],
        [Markup.button.callback(ui(lang).backToMenuBtn, 'back_to_main')],
      ];
      await args.editHtml(ctx, successText, Markup.inlineKeyboard(successButtons));
    } catch (error: unknown) {
      args.logger.error('Error handling switch confirmation:', error);
      await cbThenReplyText({ ctx, cbText: bm(lang).connectLocationCbErrorText, replyText: bm(lang).errorTryLaterOrAdminText });
    }
  });

  // Подтверждение выбора сервера
  args.bot.action(/^confirm_server_(.+)$/, async (ctx: TelegramCallbackCtx<TelegramCallbackMatch>) => {
    const serverId = ctx.match[1];
    const telegramId = ctx.from.id.toString();
    const lang = botLangFromCtx(ctx);
    void args.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, extractTelegramLanguageCode(ctx));

    try {
      const user = await args.usersService.findByTelegramId(telegramId);

      if (!user) {
        await ctx.answerCbQuery(bm(lang).userNotFoundCbText);
        return;
      }

      const server = await args.prisma.vpnServer.findUnique({ where: { id: serverId } });

      if (!server || !server.active) {
        await ctx.answerCbQuery(bm(lang).serverUnavailableCbText);
        return;
      }

      const trialDays = await args.getTrialDaysForUser(user.id);
      const result = await args.usersService.addServerAndTrial(user.id, serverId, trialDays, ctx.from.username ?? null);
      const updatedUser = result.updated;
      if (!updatedUser) return;

      if (!result.trialCreated) {
        const alertText = bm(lang).switchLocationAlertText.replace('{name}', server.name);
        await ctx.answerCbQuery(alertText, { show_alert: true });
      } else {
        await ctx.answerCbQuery();
      }

      const periodLine = result.trialCreated
        ? lang === 'en'
          ? `🎁 Trial: <b>${args.esc(trialDays)} day(s)</b>\n`
          : `🎁 Пробний період: <b>${args.esc(trialDays)} дн.</b>\n`
        : '';

      const switchHint = result.trialCreated
        ? ''
        : lang === 'en'
          ? `\n🔄 Get a new config and update it in your VPN app.\n`
          : lang === 'uk'
            ? `\n🔄 Отримайте новий конфіг та оновіть його у VPN-застосунку.\n`
            : `\n🔄 Получите новый конфиг и обновите его в VPN-приложении.\n`;

      const successText =
        `${bm(lang).locationConnectedHeaderText}\n\n` +
        `${lang === 'en' ? '📍 Location' : lang === 'uk' ? '📍 Локація' : '📍 Локация'}: <b>${args.esc(server.name)}</b>\n` +
        periodLine +
        switchHint;

      const Markup2 = await getMarkup();
      const successButtons = [
        [Markup2.button.callback(
          lang === 'en' ? '📥 Get config' : lang === 'uk' ? '📥 Отримати конфіг' : '📥 Получить конфиг',
          'get_config',
        )],
        [Markup2.button.callback(ui(lang).backToMenuBtn, 'back_to_main')],
      ];
      await args.editHtml(ctx, successText, Markup2.inlineKeyboard(successButtons));
    } catch (error: unknown) {
      args.logger.error('Error confirming server selection:', error);
      await cbThenReplyText({
        ctx,
        cbText: bm(lang).connectLocationCbErrorText,
        replyText: bm(lang).errorTryLaterOrAdminText,
      });
    }
  });

  // Назад к списку серверов
  args.bot.action('back_to_servers', async (ctx: TelegramCallbackCtx) => {
    const telegramId = ctx.from.id.toString();
    const lang = botLangFromCtx(ctx);
    void args.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, extractTelegramLanguageCode(ctx));

    try {
      await ctx.answerCbQuery();

      const user = await args.usersService.findByTelegramId(telegramId, {
        userServers: {
          include: { server: true },
        },
      });

      const allServers = await args.prisma.vpnServer.findMany({
        where: { active: true },
        orderBy: { createdAt: 'desc' },
      });

      if (allServers.length === 0) {
        await ctx.editMessageText(bm(lang).serversNoneText);
        return;
      }

      const activeServerId = user?.userServers
        ?.find((us: any) => us.isActive)?.serverId ?? null;

      const Markup = await getMarkup();
      const buttons = allServers.map((server: ServerLike) => {
        const isActive = server.id === activeServerId;
        const label = isActive ? `✅ ${server.name}` : server.name;
        const btn: any = { text: label, callback_data: `select_server_${server.id}` };
        if (isActive) btn.style = 'success';
        return [btn];
      });
      const miniAppUrl = await args.getTelegramMiniAppUrl();
      if (miniAppUrl) {
        const btn = Markup?.button?.webApp
          ? Markup.button.webApp(lang === 'en' ? '🚀 Open Mini App' : '🚀 Открыть Mini App', miniAppUrl)
          : Markup.button.url(lang === 'en' ? '🚀 Open Mini App' : '🚀 Открыть Mini App', miniAppUrl);
        buttons.push([btn]);
      }
      buttons.push([Markup.button.callback(ui(lang).backToMenuBtn, 'back_to_main')]);

      const trialDays = user ? await args.getTrialDaysForUser(user.id) : 3;
      const hasServers = user && user.userServers && user.userServers.length > 0;
      const recommended = allServers.find((s: ServerLike) => s.isRecommended);
      const recommendLine = recommended
        ? lang === 'en'
          ? `\n💡 We recommend: <b>${args.esc(recommended.name)}</b>`
          : `\n💡 Рекомендуем: <b>${args.esc(recommended.name)}</b>`
        : '';
      const messageText = hasServers
        ? lang === 'en'
          ? `📍 <b>Choose location</b>\n\nSelect a server to switch. ✅ — current.` + recommendLine
          : `📍 <b>Выбор локации</b>\n\nВыберите сервер для переключения. ✅ — текущий.` + recommendLine
        : lang === 'en'
          ? `📍 <b>Choose location</b>\n\nAfter connecting you'll get a trial period of <b>${args.esc(trialDays)} day(s)</b>.` + recommendLine
          : `📍 <b>Выбор локации</b>\n\nПосле подключения будет пробный период <b>${args.esc(trialDays)} дн.</b>` + recommendLine;

      await args.editHtml(ctx, messageText, Markup.inlineKeyboard(buttons));
    } catch (error: unknown) {
      args.logger.error('Error handling back to servers:', error);
      await ctx.reply(bm(lang).errorTryLaterText);
    }
  });
}

