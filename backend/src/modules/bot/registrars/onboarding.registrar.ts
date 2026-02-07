import type { TelegramRegistrarDeps } from './telegram-registrar.deps';
import { getPaidPlansWithFallback } from '../plans/paid-plans.utils';
import { bm } from '../messages/common.messages';
import { getMarkup } from '../telegram-markup.utils';
import { cbThenReplyText } from '../telegram-callback.utils';
import type { TelegramCallbackCtx, TelegramCallbackMatch, TelegramMessageCtx } from '../telegram-runtime.types';
import type { PlanLike, ServerLike } from '../bot-domain.types';
import { getTelegramMiniAppUrl } from '../mini-app/mini-app-url';
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
    const userName = ctx.from.first_name || ctx.from.username || 'User';
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
      const buttons = servers.map((server: ServerLike) => [
        Markup.button.callback(server.name, `select_server_${server.id}`),
      ]);
      const miniAppUrl = getTelegramMiniAppUrl(args.config);
      if (miniAppUrl) {
        const btn = Markup?.button?.webApp
          ? Markup.button.webApp(lang === 'en' ? '🚀 Open Mini App' : '🚀 Открыть Mini App', miniAppUrl)
          : Markup.button.url(lang === 'en' ? '🚀 Open Mini App' : '🚀 Открыть Mini App', miniAppUrl);
        buttons.push([btn]);
      }

      const trialDays = await args.getTrialDaysForUser(user.id);

      await args.replyHtml(
        ctx,
        lang === 'en'
          ? `👋 Hi, <b>${args.esc(userName)}</b>!\n\n` +
              `1) Choose a location\n` +
              `2) Get config and import into the app\n` +
              `3) Enable VPN\n\n` +
              `🎁 After first connection — trial period <b>${args.esc(trialDays)} day(s)</b>`
          : `👋 Привет, <b>${args.esc(userName)}</b>!\n\n` +
              `1) Выберите локацию\n` +
              `2) Получите конфиг и импортируйте в приложение\n` +
              `3) Включите VPN\n\n` +
              `🎁 После первого подключения — пробный период <b>${args.esc(trialDays)} дн.</b>`,
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
    const userName = ctx.from.first_name || ctx.from.username || 'User';
    const lang = botLangFromCtx(ctx);
    void args.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, extractTelegramLanguageCode(ctx));

    try {
      const user = await args.usersService.getOrCreateByTelegramId(telegramId, userName);

      // Проверяем, не добавлен ли уже этот сервер
      const existingUserServer = await args.prisma.userServer.findFirst({
        where: { vpnUserId: user.id, serverId },
      });

      if (existingUserServer) {
        await ctx.answerCbQuery(lang === 'en' ? 'This location is already added!' : 'Эта локация уже добавлена!');
        await args.showMainMenuEdit(ctx, user);
        return;
      }

      // Проверяем сервер
      const server = await args.prisma.vpnServer.findUnique({ where: { id: serverId } });

      if (!server || !server.active) {
        await ctx.answerCbQuery(bm(lang).serverUnavailableCbText);
        return;
      }

      await ctx.answerCbQuery();

      const { plans: paidPlans, basePlans: plans } = await getPaidPlansWithFallback({
        userId: user.id,
        plansService: args.plansService,
        prisma: args.prisma,
      });

      // Показываем первые 4 тарифа (чтобы не перегружать сообщение)
      const displayedPlans = paidPlans.slice(0, 4);

      const maskedHost = args.maskServerHost(server.host);
      const sec = server.security || 'NONE';
      const trialDays = args.getTrialDaysFromPlans(plans);

      let message =
        (lang === 'en'
          ? `📍 <b>${args.esc(server.name)}</b>\n` +
            `<i>${args.esc(maskedHost)}:${args.esc(server.port)} · ${args.esc(sec)}</i>\n\n` +
            `🎁 Trial access: <b>${args.esc(trialDays)} day(s)</b>\n`
          : `📍 <b>${args.esc(server.name)}</b>\n` +
            `<i>${args.esc(maskedHost)}:${args.esc(server.port)} · ${args.esc(sec)}</i>\n\n` +
            `🎁 Пробный доступ: <b>${args.esc(trialDays)} дн.</b>\n`);

      if (displayedPlans.length > 0) {
        const middleIndex = Math.floor(displayedPlans.length / 2);
        const recommendedPlan = displayedPlans[middleIndex];
        const minPrice = Math.min(
          ...displayedPlans.map((p: PlanLike) => Math.min(...((p.variants ?? []).map((v) => v.price)))),
        );
        const minPricePlan = displayedPlans.find((p: PlanLike) =>
          (p.variants ?? []).some((v) => v.price === minPrice),
        );

        message += lang === 'en' ? `\n<b>Plans after trial</b>\n` : `\n<b>Тарифы после пробного периода</b>\n`;
        displayedPlans.forEach((plan: PlanLike) => {
          const tag = plan.id === recommendedPlan?.id ? ' ⭐' : '';
          const prices = (plan.variants ?? [])
            .map((v) => `${args.esc(v.price)} ${args.esc(v.currency)}`)
            .join(' | ');
          message +=
            lang === 'en'
              ? `• <b>${args.esc(plan.name)}</b>${tag} — ${prices} / ${args.esc(plan.periodDays)} day(s)\n`
              : `• <b>${args.esc(plan.name)}</b>${tag} — ${prices} / ${args.esc(plan.periodDays)} дн.\n`;
        });
        if (paidPlans.length > displayedPlans.length) {
          message +=
            lang === 'en'
              ? `• …${args.esc(paidPlans.length - displayedPlans.length)} more plans\n`
              : `• …ещё ${args.esc(paidPlans.length - displayedPlans.length)} тарифов\n`;
        }
        const minPriceCurrency =
          (minPricePlan?.variants ?? []).find((v) => v.price === minPrice)?.currency ?? 'RUB';
        message +=
          lang === 'en'
            ? `\n💰 From <b>${args.esc(minPrice)} ${args.esc(minPriceCurrency)}</b>\n`
            : `\n💰 От <b>${args.esc(minPrice)} ${args.esc(minPriceCurrency)}</b>\n`;
      }

      message += lang === 'en' ? `\nTap “Confirm” to connect.` : `\nНажмите «Подтвердить», чтобы подключиться.`;

      const Markup = await getMarkup();
      const buttons = [
        [
          Markup.button.callback(
            lang === 'en' ? '✅ Confirm & connect' : '✅ Подтвердить и подключить',
            `confirm_server_${serverId}`,
          ),
        ],
        [Markup.button.callback(lang === 'en' ? '🔙 Choose another location' : '🔙 Выбрать другую локацию', 'back_to_servers')],
      ];

      await args.editHtml(ctx, message, Markup.inlineKeyboard(buttons));
    } catch (error: unknown) {
      args.logger.error('Error handling server selection:', error);
      await cbThenReplyText({ ctx, cbText: bm(lang).loadInfoCbText, replyText: bm(lang).errorTryLaterText });
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

      await ctx.answerCbQuery(bm(lang).cbConnectingLocationText);

      const trialDays = await args.getTrialDaysForUser(user.id);
      const result = await args.usersService.addServerAndTrialWithUsername(user.id, serverId, trialDays, ctx.from.username ?? null);
      const updatedUser = result.updated;
      if (!updatedUser) return;

      const expiresAtStr = updatedUser.expiresAt
        ? new Date(updatedUser.expiresAt).toLocaleString(lang === 'en' ? 'en-GB' : 'ru-RU', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : null;
      const periodLine = result.trialCreated
        ? lang === 'en'
          ? `🎁 Trial period: ${args.esc(trialDays)} day(s)\n\n`
          : `🎁 Пробный период: ${args.esc(trialDays)} дн.\n\n`
        : expiresAtStr
          ? lang === 'en'
            ? `📅 Active until: ${expiresAtStr}\n\n`
            : `📅 Подписка активна до: ${expiresAtStr}\n\n`
          : '\n';

      await ctx.editMessageText(
        `${bm(lang).locationConnectedHeaderText}\n\n` +
          `${lang === 'en' ? '📍 Location' : '📍 Локация'}: ${server.name}\n` +
          periodLine +
          bm(lang).afterConnectHintText,
      );

      await args.showMainMenuEdit(ctx, updatedUser);
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

      const Markup = await getMarkup();
      const buttons = allServers.map((server: ServerLike) => [
        Markup.button.callback(server.name, `select_server_${server.id}`),
      ]);
      buttons.push([Markup.button.callback(ui(lang).backToMenuBtn, 'back_to_main')]);

      const trialDays = user ? await args.getTrialDaysForUser(user.id) : 3;
      const messageText =
        user && user.userServers && user.userServers.length > 0
          ? lang === 'en'
            ? `📍 <b>Choose location</b>\n\nSelect a server to switch or get a new config.`
            : `📍 <b>Выбор локации</b>\n\nВыберите сервер для переключения или получения нового конфига.`
          : lang === 'en'
            ? `📍 <b>Choose location</b>\n\nAfter connecting you’ll get a trial period of <b>${args.esc(trialDays)} day(s)</b>.`
            : `📍 <b>Выбор локации</b>\n\nПосле подключения будет пробный период <b>${args.esc(trialDays)} дн.</b>`;

      await args.editHtml(ctx, messageText, Markup.inlineKeyboard(buttons));
    } catch (error: unknown) {
      args.logger.error('Error handling back to servers:', error);
      await ctx.reply(bm(lang).errorTryLaterText);
    }
  });
}

