import type { TelegramRegistrarDeps } from './telegram-registrar.deps';
import { getPaidPlansWithFallback } from '../plans/paid-plans.utils';
import { BotMessages } from '../messages/common.messages';
import { getMarkup } from '../telegram-markup.utils';
import { editOrReplyHtml } from '../telegram-reply.utils';
import type { TelegramCallbackCtx, TelegramCallbackMatch, TelegramMessageCtx } from '../telegram-runtime.types';
import { getErrorMessage } from '../telegram-error.utils';
import { formatPlanGroupButtonLabel, groupPlansByNameAndPeriod } from '../plans/plan-grouping.utils';
import { sendTelegramStarsInvoice } from '../../payments/telegram-stars/telegram-bot-api';
import { buildTelegramStarsInvoicePayload } from '../../payments/telegram-stars/telegram-stars.payload';
import { createExternalUrlPaymentIntent } from '../../payments/payment-providers/external-url.provider';

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
      const groups = groupPlansByNameAndPeriod(paidPlans);
      const buttons = groups.map((g) => [
        Markup.button.callback(formatPlanGroupButtonLabel(g), `select_plan_${g.representative.id}`),
      ]);

      await args.replyHtml(
        ctx,
        `💳 <b>Оплата подписки</b>\n\n` + `Выберите тариф ниже — после оплаты подписка активируется автоматически.`,
        Markup.inlineKeyboard(buttons),
      );
    } catch (error: unknown) {
      args.logger.error('Error handling /pay command:', error);
      await ctx.reply(BotMessages.errorTryLaterText);
    }
  });

  // Выбор тарифа
  args.bot.action(/^select_plan_(.+)$/, async (ctx: TelegramCallbackCtx<TelegramCallbackMatch>) => {
    const planId = ctx.match[1];
    const telegramId = ctx.from.id.toString();

    try {
      await ctx.answerCbQuery(BotMessages.cbProcessingText);

      const user = await args.usersService.findByTelegramId(telegramId);

      if (!user) {
        await ctx.reply(BotMessages.userNotFoundUseStartText);
        return;
      }

      const plan = await args.prisma.plan.findUnique({
        where: { id: planId },
        include: { variants: { where: { active: true }, orderBy: { price: 'asc' } } },
      });

      if (!plan || !plan.active || plan.isTrial) {
        await ctx.reply(BotMessages.planUnavailableText);
        return;
      }

      const variants = (plan as any).variants ?? [];
      const starsVariant = variants.find((v: any) => v.currency === 'XTR') ?? null;
      const externalVariant =
        variants.find((v: any) => v.currency === 'RUB') ?? variants.find((v: any) => v.currency !== 'XTR') ?? null;

      const Markup = await getMarkup();
      const methodButtons: Array<Array<ReturnType<typeof Markup.button.callback>>> = [];

      if (starsVariant)
        methodButtons.push([
          Markup.button.callback('⭐ Telegram Stars', `pay_with_TELEGRAM_STARS_${starsVariant.id}`),
        ]);
      if (externalVariant)
        methodButtons.push([
          Markup.button.callback('💳 Карта / RUB', `pay_with_EXTERNAL_URL_${externalVariant.id}`),
        ]);

      if (methodButtons.length === 0) {
        await editOrReplyHtml(ctx, BotMessages.noPaidPlansHtml);
        return;
      }

      await editOrReplyHtml(ctx, `💳 <b>${args.esc(plan.name)}</b>\n\nВыберите способ оплаты:`, Markup.inlineKeyboard(methodButtons));
    } catch (error: unknown) {
      args.logger.error('Error handling plan selection:', error);
      await ctx.answerCbQuery(BotMessages.paymentCreateCbErrorText);
      await ctx.reply(
        `❌ Произошла ошибка при обработке платежа.\n\n` +
          `Ошибка: ${getErrorMessage(error) || 'Неизвестная ошибка'}\n\n` +
          `Попробуйте позже или обратитесь к администратору.`,
      );
    }
  });

  // Выбор способа оплаты
  args.bot.action(
    /^pay_with_(TELEGRAM_STARS|EXTERNAL_URL)_(.+)$/,
    async (ctx: TelegramCallbackCtx<TelegramCallbackMatch>) => {
      const provider = ctx.match[1] as 'TELEGRAM_STARS' | 'EXTERNAL_URL';
      const variantId = ctx.match[2];
      const telegramId = ctx.from.id.toString();

      try {
        await ctx.answerCbQuery(BotMessages.cbProcessingText);

        const user = await args.usersService.findByTelegramId(telegramId);
        if (!user) {
          await ctx.reply(BotMessages.userNotFoundUseStartText);
          return;
        }

        const variant = await (args.prisma as any).planVariant.findUnique({
          where: { id: variantId },
          include: { plan: true },
        });

        const plan = variant?.plan;
        if (!variant || !plan || !plan.active || plan.isTrial || !variant.active) {
          await ctx.reply(BotMessages.planUnavailableText);
          return;
        }

        if (provider === 'TELEGRAM_STARS') {
          if (variant.currency !== 'XTR') {
            await editOrReplyHtml(ctx, `⚠️ Этот вариант нельзя оплатить через Stars (валюта: <b>${args.esc(variant.currency)}</b>).`);
            return;
          }

          const secret = args.config.get<string>('PAYMENTS_PAYLOAD_SECRET') || args.botToken;
          const payload = buildTelegramStarsInvoicePayload({
            userId: user.id,
            planId: plan.id,
            variantId: variant.id,
            issuedAt: Date.now(),
            secret,
          });

          await sendTelegramStarsInvoice({
            token: args.botToken,
            chatId: ctx.from.id,
            title: `VPN — ${plan.name}`,
            description: `Подписка на ${plan.periodDays} дней`,
            payload,
            currency: 'XTR',
            prices: [{ label: plan.name, amount: variant.price }],
          });

          await editOrReplyHtml(
            ctx,
            `💳 Счёт отправлен.\n\n` +
              `Оплатите <b>${args.esc(variant.price)} XTR</b>, затем подписка активируется автоматически.`,
          );
          return;
        }

        // EXTERNAL_URL
        if (variant.currency === 'XTR') {
          await editOrReplyHtml(ctx, `⚠️ Этот тариф предназначен для Stars. Выберите оплату Stars.`);
          return;
        }

        const intent = await createExternalUrlPaymentIntent({
          config: args.config,
          data: { vpnUserId: user.id, planId: plan.id },
        });

        if (intent.type !== 'EXTERNAL_URL' || !('paymentUrl' in intent)) {
          await editOrReplyHtml(ctx, `⚠️ Внешняя оплата пока недоступна.\n\n${args.esc((intent as any).reason ?? '')}`);
          return;
        }

        const Markup = await getMarkup();
        await editOrReplyHtml(
          ctx,
          `💳 <b>Оплата картой</b>\n\nНажмите кнопку ниже, чтобы перейти к оплате.`,
          Markup.inlineKeyboard([[Markup.button.url('Открыть оплату', intent.paymentUrl)]]),
        );
      } catch (error: unknown) {
        args.logger.error('Error handling pay_with:', error);
        await ctx.answerCbQuery(BotMessages.paymentCreateCbErrorText);
        await ctx.reply(BotMessages.errorTryLaterText);
      }
    },
  );
}

