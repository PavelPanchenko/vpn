import { SupportMessageType } from '@prisma/client';
import { buildStatusMenuSnippet } from '../messages/status.message';
import type { TelegramRegistrarDeps } from './telegram-registrar.deps';
import { getPaidPlansWithFallback } from '../plans/paid-plans.utils';
import { BotMessages } from '../messages/common.messages';
import { getMarkup } from '../telegram-markup.utils';
import { editOrReplyHtml } from '../telegram-reply.utils';
import { cbThenReplyHtml, cbThenReplyText } from '../telegram-callback.utils';
import type { TelegramCallbackCtx, TelegramMessageCtx } from '../telegram-runtime.types';

export function registerMainMenuHandlers(args: TelegramRegistrarDeps) {
  args.bot.action('get_config', async (ctx: TelegramCallbackCtx) => {
    const telegramId = ctx.from.id.toString();
    const user = await args.usersService.findByTelegramId(telegramId);

    if (!user) {
      await ctx.answerCbQuery(BotMessages.userNotFoundCbText);
      return;
    }
    await ctx.answerCbQuery();
    await args.sendConfigMessage(ctx, user);
  });

  args.bot.action('show_pay', async (ctx: TelegramCallbackCtx) => {
    const telegramId = ctx.from.id.toString();

    try {
      const user = await args.usersService.findByTelegramId(telegramId);

      if (!user) {
        await ctx.answerCbQuery(BotMessages.userNotFoundCbText);
        return;
      }

      const { plans: paidPlans, basePlans } = await getPaidPlansWithFallback({
        userId: user.id,
        plansService: args.plansService,
        prisma: args.prisma,
        logger: args.logger,
      });
      args.logger.debug(`Found ${basePlans.length} plans for user ${user.id}`);
      args.logger.debug(`Found ${paidPlans.length} paid plans after filtering`);

      if (paidPlans.length === 0) {
        await cbThenReplyHtml({
          ctx,
          cbText: BotMessages.noPaidPlansCbText,
          html: BotMessages.noPaidPlansHtml,
          replyHtml: args.replyHtml,
        });
        return;
      }

      const Markup = await getMarkup();
      const buttons = paidPlans.map((plan: any) => [
        Markup.button.callback(args.planBtnLabel(plan), `select_plan_${plan.id}`),
      ]);

      await ctx.answerCbQuery();

      await editOrReplyHtml(
        ctx,
        `💳 <b>Оплата подписки</b>\n\nВыберите тариф ниже — подписка активируется автоматически.`,
        Markup.inlineKeyboard(buttons),
      );
    } catch (error: any) {
      args.logger.error('Error handling show_pay action:', error);
      await cbThenReplyText({ ctx, cbText: BotMessages.errorCbText, replyText: BotMessages.errorTryLaterText });
    }
  });

  // Обработка кнопки "Назад в меню"
  args.bot.action('back_to_main', async (ctx: TelegramCallbackCtx) => {
    const telegramId = ctx.from.id.toString();

    try {
      const user = await args.usersService.findByTelegramId(telegramId, { userServers: true });

      if (!user) {
        await ctx.answerCbQuery(BotMessages.userNotFoundCbText);
        return;
      }

      await ctx.answerCbQuery();

      // Просто показываем главное меню заново (кнопки строятся из актуального состояния пользователя)
      try {
        await ctx.editMessageText('🏠 Главное меню:');
      } catch {
        // ignore
      }
      await args.showMainMenu(ctx, user);
    } catch (error: any) {
      args.logger.error('Error handling back_to_main action:', error);
      await ctx.answerCbQuery(BotMessages.errorCbText);
    }
  });

  args.bot.action('show_status', async (ctx: TelegramCallbackCtx) => {
    const telegramId = ctx.from.id.toString();

    try {
      const user = await args.usersService.findByTelegramId(telegramId, {
        subscriptions: {
          where: { active: true },
          orderBy: { endsAt: 'desc' },
          take: 1,
        },
        userServers: { where: { isActive: true } },
      });

      if (!user) {
        await ctx.answerCbQuery(BotMessages.userNotFoundCbText);
        return;
      }

      const statusText = buildStatusMenuSnippet({ user, fmtDate: args.fmtDate });
      const menuKeyboard = await args.buildMainMenuKeyboard(user);

      await ctx.answerCbQuery();

      try {
        await ctx.editMessageText(`🏠 Главное меню:${statusText}`, menuKeyboard);
      } catch {
        await ctx.reply(`🏠 Главное меню:${statusText}`, menuKeyboard);
      }
    } catch (error: any) {
      args.logger.error('Error handling show_status action:', error);
      await ctx.answerCbQuery(BotMessages.errorCbText);
    }
  });

  // Обработка кнопки "Поддержка"
  args.bot.action('start_support', async (ctx: TelegramCallbackCtx) => {
    const telegramId = ctx.from.id.toString();

    try {
      const user = await args.usersService.findByTelegramId(telegramId);

      if (!user) {
        await ctx.answerCbQuery(BotMessages.userNotFoundCbText);
        return;
      }

      await ctx.answerCbQuery();
      await args.enableSupportMode(ctx, telegramId);
    } catch (error: any) {
      args.logger.error('Error starting support mode:', error);
      await ctx.answerCbQuery(BotMessages.errorCbText);
    }
  });

  // Обработка текстовых сообщений от пользователей (для поддержки)
  args.bot.on('text', async (ctx: TelegramMessageCtx & { message: { text?: string } }) => {
    // Пропускаем команды
    if (ctx.message.text?.startsWith('/')) return;

    const telegramId = ctx.from.id.toString();

    // Проверяем, находится ли пользователь в режиме поддержки
    if (!args.supportModeUsers.get(telegramId)) return;

    const messageText = ctx.message.text;
    if (!messageText || messageText.trim().length === 0) return;

    try {
      const user = await args.usersService.findByTelegramId(telegramId);

      if (!user) {
        await ctx.reply(BotMessages.userNotFoundUseStartText);
        args.supportModeUsers.delete(telegramId);
        return;
      }

      // Сохраняем сообщение в поддержку
      await args.supportService.create({
        vpnUserId: user.id,
        type: SupportMessageType.USER_MESSAGE,
        message: messageText,
      });

      await args.replyHtml(
        ctx,
        `✅ <b>Сообщение отправлено</b>\n\n` +
          `Если хотите добавить детали — отправьте ещё одно сообщение.\n` +
          `Выйти: <code>/cancel</code> или <code>/start</code>`,
      );
    } catch (error: any) {
      args.logger.error('Error handling user message:', error);
      await ctx.reply(BotMessages.supportSendFailedText);
    }
  });
}

