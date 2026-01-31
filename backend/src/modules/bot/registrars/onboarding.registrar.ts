import type { TelegramRegistrarDeps } from './telegram-registrar.deps';
import { getPaidPlansWithFallback } from '../plans/paid-plans.utils';
import { BotMessages } from '../messages/common.messages';
import { getMarkup } from '../telegram-markup.utils';
import { cbThenReplyText } from '../telegram-callback.utils';
import type { TelegramCallbackCtx, TelegramMessageCtx } from '../telegram-runtime.types';

export function registerOnboardingHandlers(args: TelegramRegistrarDeps) {
  // /start
  args.bot.command('start', async (ctx: TelegramMessageCtx) => {
    const telegramId = ctx.from.id.toString();
    // Выходим из режима поддержки при /start
    args.supportModeUsers.delete(telegramId);
    const userName = ctx.from.first_name || ctx.from.username || 'User';

    try {
      const user = await args.usersService.getOrCreateByTelegramId(telegramId, userName, {
        userServers: true,
      });

      if (!user) {
        await ctx.reply(BotMessages.userCreateFailedTryLaterText);
        return;
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
        await ctx.reply(BotMessages.serversNoneText);
        return;
      }

      const Markup = await getMarkup();
      const buttons = servers.map((server: any) => [Markup.button.callback(server.name, `select_server_${server.id}`)]);

      const trialDays = await args.getTrialDaysForUser(user.id);

      await args.replyHtml(
        ctx,
        `👋 Привет, <b>${args.esc(userName)}</b>!\n\n` +
          `Выберите локацию для подключения.\n` +
          `После первого подключения будет <b>пробный период на ${args.esc(trialDays)} дн.</b>`,
        Markup.inlineKeyboard(buttons),
      );
    } catch (error: any) {
      args.logger.error('Error handling /start command:', error);
      await ctx.reply(BotMessages.errorTryLaterText);
    }
  });

  // Выбор сервера -> показать инфо и тарифы
  args.bot.action(/^select_server_(.+)$/, async (ctx: TelegramCallbackCtx) => {
    const serverId = ctx.match[1];
    const telegramId = ctx.from.id.toString();
    const userName = ctx.from.first_name || ctx.from.username || 'User';

    try {
      const user = await args.usersService.getOrCreateByTelegramId(telegramId, userName);

      // Проверяем, не добавлен ли уже этот сервер
      const existingUserServer = await args.prisma.userServer.findFirst({
        where: { vpnUserId: user.id, serverId },
      });

      if (existingUserServer) {
        await ctx.answerCbQuery('Эта локация уже добавлена!');
        await args.showMainMenu(ctx, user);
        return;
      }

      // Проверяем сервер
      const server = await args.prisma.vpnServer.findUnique({ where: { id: serverId } });

      if (!server || !server.active) {
        await ctx.answerCbQuery(BotMessages.serverUnavailableCbText);
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
        `📍 <b>${args.esc(server.name)}</b>\n` +
        `<i>${args.esc(maskedHost)}:${args.esc(server.port)} · ${args.esc(sec)}</i>\n\n` +
        `🎁 Пробный доступ: <b>${args.esc(trialDays)} дн.</b>\n`;

      if (displayedPlans.length > 0) {
        const middleIndex = Math.floor(displayedPlans.length / 2);
        const recommendedPlan = displayedPlans[middleIndex];
        const minPrice = Math.min(...displayedPlans.map((p: any) => p.price));
        const minPricePlan = displayedPlans.find((p: any) => p.price === minPrice);

        message += `\n<b>Тарифы после пробного периода</b>\n`;
        displayedPlans.forEach((plan: any) => {
          const tag = plan.id === recommendedPlan?.id ? ' ⭐' : '';
          message += `• <b>${args.esc(plan.name)}</b>${tag} — ${args.esc(plan.price)} ${args.esc(plan.currency)} / ${args.esc(
            plan.periodDays,
          )} дн.\n`;
        });
        if (paidPlans.length > displayedPlans.length) {
          message += `• …ещё ${args.esc(paidPlans.length - displayedPlans.length)} тарифов\n`;
        }
        message += `\n💰 От <b>${args.esc(minPrice)} ${args.esc(minPricePlan?.currency || 'RUB')}</b>\n`;
      }

      message += `\nНажмите «Подтвердить», чтобы подключиться.`;

      const Markup = await getMarkup();
      const buttons = [
        [Markup.button.callback('✅ Подтвердить и подключить', `confirm_server_${serverId}`)],
        [Markup.button.callback('🔙 Выбрать другую локацию', 'back_to_servers')],
      ];

      await args.editHtml(ctx, message, Markup.inlineKeyboard(buttons));
    } catch (error: any) {
      args.logger.error('Error handling server selection:', error);
      await cbThenReplyText({ ctx, cbText: BotMessages.loadInfoCbText, replyText: BotMessages.errorTryLaterText });
    }
  });

  // Подтверждение выбора сервера
  args.bot.action(/^confirm_server_(.+)$/, async (ctx: TelegramCallbackCtx) => {
    const serverId = ctx.match[1];
    const telegramId = ctx.from.id.toString();

    try {
      const user = await args.usersService.findByTelegramId(telegramId);

      if (!user) {
        await ctx.answerCbQuery(BotMessages.userNotFoundCbText);
        return;
      }

      const server = await args.prisma.vpnServer.findUnique({ where: { id: serverId } });

      if (!server || !server.active) {
        await ctx.answerCbQuery(BotMessages.serverUnavailableCbText);
        return;
      }

      await ctx.answerCbQuery(BotMessages.cbConnectingLocationText);
      // (сообщение вынесено в BotMessages для DRY)

      const trialDays = await args.getTrialDaysForUser(user.id);
      const result = await args.usersService.addServerAndTrial(user.id, serverId, trialDays);
      const updatedUser = result.updated;
      if (!updatedUser) return;

      const expiresAtStr = updatedUser.expiresAt ? new Date(updatedUser.expiresAt).toLocaleDateString('ru-RU') : null;
      const periodLine = result.trialCreated
        ? `🎁 Пробный период: ${args.esc(trialDays)} дн.\n\n`
        : expiresAtStr
          ? `📅 Подписка активна до: ${expiresAtStr}\n\n`
          : '\n';

      await ctx.editMessageText(
        `${BotMessages.locationConnectedHeaderText}\n\n` +
          `📍 Локация: ${server.name}\n` +
          periodLine +
          BotMessages.afterConnectHintText,
      );

      await args.showMainMenu(ctx, updatedUser);
    } catch (error: any) {
      args.logger.error('Error confirming server selection:', error);
      await cbThenReplyText({
        ctx,
        cbText: BotMessages.connectLocationCbErrorText,
        replyText: BotMessages.errorTryLaterOrAdminText,
      });
    }
  });

  // Назад к списку серверов
  args.bot.action('back_to_servers', async (ctx: TelegramCallbackCtx) => {
    const telegramId = ctx.from.id.toString();

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
        await ctx.editMessageText(BotMessages.serversNoneText);
        return;
      }

      const Markup = await getMarkup();
      const buttons = allServers.map((server: any) => [Markup.button.callback(server.name, `select_server_${server.id}`)]);

      const trialDays = user ? await args.getTrialDaysForUser(user.id) : 3;
      const messageText =
        user && user.userServers && user.userServers.length > 0
          ? `📍 Выберите локацию:\n\nВыберите сервер для получения конфигурации или переключения.`
          : `🚀 Выберите локацию для подключения:\n\nПосле выбора вам будет предоставлен пробный период на ${args.esc(
              trialDays,
            )} дн.`;

      await ctx.editMessageText(messageText, Markup.inlineKeyboard(buttons));
    } catch (error: any) {
      args.logger.error('Error handling back to servers:', error);
      await ctx.reply(BotMessages.errorTryLaterText);
    }
  });
}

