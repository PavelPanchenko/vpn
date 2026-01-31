import type { TelegramRegistrarDeps } from './telegram-registrar.deps';
import { getPaidPlansWithFallback } from '../plans/paid-plans.utils';
import { BotMessages } from '../messages/common.messages';
import { getMarkup } from '../telegram-markup.utils';
import { editOrReplyHtml } from '../telegram-reply.utils';
import type { TelegramCallbackCtx, TelegramMessageCtx } from '../telegram-runtime.types';

export function registerPaymentsHandlers(args: TelegramRegistrarDeps) {
  // /pay - показываем тарифы
  args.bot.command('pay', async (ctx: TelegramMessageCtx) => {
    const telegramId = ctx.from.id.toString();

    try {
      const user = await args.usersService.findByTelegramId(telegramId);

      if (!user) {
        await ctx.reply(BotMessages.userNotFoundUseStartText);
        return;
      }

      const { plans: paidPlans, basePlans } = await getPaidPlansWithFallback({
        userId: user.id,
        plansService: args.plansService,
        prisma: args.prisma,
        logger: args.logger,
        logContext: 'command /pay',
      });
      args.logger.debug(`Found ${basePlans.length} plans for user ${user.id} (command /pay)`);
      args.logger.debug(`Found ${paidPlans.length} paid plans after filtering (command /pay)`);

      if (paidPlans.length === 0) {
        await args.replyHtml(ctx, BotMessages.noPaidPlansHtml);
        return;
      }

      const Markup = await getMarkup();
      const buttons = paidPlans.map((plan: any) => [
        Markup.button.callback(args.planBtnLabel(plan), `select_plan_${plan.id}`),
      ]);

      await args.replyHtml(
        ctx,
        `💳 <b>Оплата подписки</b>\n\n` + `Выберите тариф ниже — после оплаты подписка активируется автоматически.`,
        Markup.inlineKeyboard(buttons),
      );
    } catch (error: any) {
      args.logger.error('Error handling /pay command:', error);
      await ctx.reply(BotMessages.errorTryLaterText);
    }
  });

  // Выбор тарифа
  args.bot.action(/^select_plan_(.+)$/, async (ctx: TelegramCallbackCtx) => {
    const planId = ctx.match[1];
    const telegramId = ctx.from.id.toString();

    try {
      await ctx.answerCbQuery(BotMessages.cbProcessingText);

      const user = await args.usersService.findByTelegramId(telegramId);

      if (!user) {
        await ctx.reply(BotMessages.userNotFoundUseStartText);
        return;
      }

      const plan = await args.prisma.plan.findUnique({ where: { id: planId } });

      if (!plan || !plan.active || plan.isTrial) {
        await ctx.reply(BotMessages.planUnavailableText);
        return;
      }

      // PaymentsService.create автоматически создаст подписку, если статус PAID
      await args.paymentsService.create({
        vpnUserId: user.id,
        planId: plan.id,
        amount: plan.price,
        currency: plan.currency,
        status: 'PAID',
      });

      const msg =
        `✅ <b>Оплата прошла</b>\n\n` +
        `📦 Тариф: <b>${args.esc(plan.name)}</b>\n` +
        `💰 Сумма: <b>${args.esc(plan.price)} ${args.esc(plan.currency)}</b>\n` +
        `📅 Период: <b>${args.esc(plan.periodDays)}</b> дн.\n\n` +
        `Далее: получить конфиг — <code>/config</code>`;

      await editOrReplyHtml(ctx, msg);
    } catch (error: any) {
      args.logger.error('Error handling plan selection:', error);
      await ctx.answerCbQuery(BotMessages.paymentCreateCbErrorText);
      await ctx.reply(
        `❌ Произошла ошибка при обработке платежа.\n\n` +
          `Ошибка: ${error?.message || 'Неизвестная ошибка'}\n\n` +
          `Попробуйте позже или обратитесь к администратору.`,
      );
    }
  });
}

