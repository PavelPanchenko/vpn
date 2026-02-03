import type { TelegramRegistrarDeps } from './telegram-registrar.deps';
import { getPaidPlansWithFallback } from '../plans/paid-plans.utils';
import { BotMessages, PaymentMessages } from '../messages/common.messages';
import { getMarkup } from '../telegram-markup.utils';
import { editOrReplyHtml } from '../telegram-reply.utils';
import type { TelegramCallbackCtx, TelegramCallbackMatch, TelegramMessageCtx } from '../telegram-runtime.types';
import { getErrorMessage } from '../telegram-error.utils';
import { formatPlanGroupButtonLabel, groupPlansByNameAndPeriod } from '../plans/plan-grouping.utils';

export function registerPaymentsHandlers(args: TelegramRegistrarDeps) {
  async function renderPayPlans(args2: {
    ctx: TelegramMessageCtx;
    telegramId: string;
    mode: 'reply' | 'editOrReply';
  }) {
    const user = await args.usersService.findByTelegramId(args2.telegramId);
    if (!user) {
      await args.replyHtml(args2.ctx, BotMessages.userNotFoundUseStartText);
      return;
    }

    const { plans: paidPlans, basePlans } = await getPaidPlansWithFallback({
      userId: user.id,
      plansService: args.plansService,
      prisma: args.prisma,
      logger: args.logger,
      logContext: args2.mode === 'reply' ? 'command /pay' : 'action pay_back_to_plans',
    });
    args.logger.debug(`Found ${basePlans.length} plans for user ${user.id}`);
    args.logger.debug(`Found ${paidPlans.length} paid plans after filtering`);

    if (paidPlans.length === 0) {
      if (args2.mode === 'reply') await args.replyHtml(args2.ctx, BotMessages.noPaidPlansHtml);
      else await editOrReplyHtml(args2.ctx as any, BotMessages.noPaidPlansHtml);
      return;
    }

    const Markup = await getMarkup();
    const groups = groupPlansByNameAndPeriod(paidPlans);
    const buttons = groups.map((g) => [Markup.button.callback(formatPlanGroupButtonLabel(g), `select_plan_${g.representative.id}`)]);
    buttons.push([Markup.button.callback('🏠 В меню', 'back_to_main')]);

    const text =
      `💳 <b>Оплата</b>\n\n` +
      `1) Выберите тариф\n` +
      `2) Выберите способ оплаты\n\n` +
      `После оплаты подписка активируется автоматически.`;

    if (args2.mode === 'reply') {
      await args.replyHtml(args2.ctx, text, Markup.inlineKeyboard(buttons));
    } else {
      await editOrReplyHtml(args2.ctx as any, text, Markup.inlineKeyboard(buttons));
    }
  }

  // /pay - показываем тарифы
  args.bot.command('pay', async (ctx: TelegramMessageCtx) => {
    const telegramId = ctx.from.id.toString();

    try {
      await renderPayPlans({ ctx, telegramId, mode: 'reply' });
    } catch (error: unknown) {
      args.logger.error('Error handling /pay command:', error);
      await ctx.reply(BotMessages.errorTryLaterText);
    }
  });

  // Назад к списку тарифов (из экрана выбора способа оплаты/оплаты)
  args.bot.action('pay_back_to_plans', async (ctx: TelegramCallbackCtx) => {
    const telegramId = ctx.from.id.toString();
    try {
      await ctx.answerCbQuery(BotMessages.cbProcessingText);
      await renderPayPlans({ ctx: ctx as any, telegramId, mode: 'editOrReply' });
    } catch (error: unknown) {
      args.logger.error('Error handling pay_back_to_plans:', error);
      await ctx.answerCbQuery(BotMessages.errorCbText);
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
          Markup.button.callback(
            `⭐ Stars — ${args.esc(starsVariant.price)} XTR`,
            `pay_with_TELEGRAM_STARS_${starsVariant.id}`,
          ),
        ]);
      if (externalVariant)
        methodButtons.push([
          Markup.button.callback(
            `💳 Карта/СБП — ${args.esc(externalVariant.price)} ${args.esc(externalVariant.currency)}`,
            `pay_with_PLATEGA_${externalVariant.id}`,
          ),
        ]);

      if (methodButtons.length === 0) {
        await editOrReplyHtml(ctx, BotMessages.noPaidPlansHtml);
        return;
      }

      const rows: any[] = [...methodButtons];
      rows.push([Markup.button.callback('⬅️ Назад к тарифам', 'pay_back_to_plans')]);
      rows.push([Markup.button.callback('🏠 В меню', 'back_to_main')]);

      await editOrReplyHtml(
        ctx,
        `💳 <b>${args.esc(plan.name)}</b>\n\n` + `Выберите способ оплаты:`,
        Markup.inlineKeyboard(rows),
      );
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
    /^pay_with_(TELEGRAM_STARS|PLATEGA)_(.+)$/,
    async (ctx: TelegramCallbackCtx<TelegramCallbackMatch>) => {
      const provider = ctx.match[1] as 'TELEGRAM_STARS' | 'PLATEGA';
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

          const intent = await args.paymentIntentsService.createForVariant({
            vpnUserId: user.id,
            variantId: variant.id,
            provider: 'TELEGRAM_STARS',
            botToken: args.botToken,
          });
          if ('type' in intent && intent.type === 'UNSUPPORTED') {
            await editOrReplyHtml(ctx, `⚠️ Оплата Stars пока недоступна.\n\n${args.esc(intent.reason)}`);
            return;
          }
          if (!('invoiceLink' in intent)) {
            await editOrReplyHtml(ctx, `⚠️ Оплата Stars пока недоступна.`);
            return;
          }

          // Одно сообщение: сначала «Счёт отправлен...», через 2 сек — инфо о подписке и кнопка-ссылка на инвойс (без второго сообщения в чат)
          const billSentText = PaymentMessages.billSentStarsTemplate.replace('{price}', args.esc(variant.price));
          const MarkupStars = await getMarkup();
          await editOrReplyHtml(ctx, billSentText, MarkupStars.inlineKeyboard([[MarkupStars.button.callback('🏠 В меню', 'back_to_main')]]));

          const subscriptionText = PaymentMessages.starsSubscriptionScreenTemplate
            .replace(/{planName}/g, args.esc(plan.name))
            .replace(/{periodDays}/g, String(plan.periodDays))
            .replace(/{price}/g, args.esc(variant.price));
          const payButtonLabel = PaymentMessages.starsPayButtonLabel.replace('{price}', args.esc(variant.price));
          const invoiceLink = intent.invoiceLink;

          setTimeout(() => {
            editOrReplyHtml(
              ctx,
              subscriptionText,
              MarkupStars.inlineKeyboard([
                [MarkupStars.button.url(payButtonLabel, invoiceLink)],
                [MarkupStars.button.callback('🏠 В меню', 'back_to_main')],
              ]),
            ).catch(() => {});
          }, 2000);
          return;
        }

        // PLATEGA
        if (variant.currency === 'XTR') {
          await editOrReplyHtml(ctx, `⚠️ Этот тариф предназначен для Stars. Выберите оплату Stars.`);
          return;
        }

        const intent = await args.paymentIntentsService.createForVariant({
          vpnUserId: user.id,
          variantId: variant.id,
          provider: 'PLATEGA',
        });
        if ('type' in intent && intent.type === 'UNSUPPORTED') {
          await editOrReplyHtml(ctx, `⚠️ Внешняя оплата пока недоступна.\n\n${args.esc(intent.reason)}`);
          return;
        }
        if (!('paymentUrl' in intent)) {
          await editOrReplyHtml(ctx, `⚠️ Внешняя оплата пока недоступна.`);
          return;
        }

        const Markup = await getMarkup();
        await editOrReplyHtml(
          ctx,
          PaymentMessages.plategaInstructionsHtml,
          Markup.inlineKeyboard([
            [Markup.button.url(PaymentMessages.openPaymentButtonLabel, intent.paymentUrl)],
            [Markup.button.callback('⬅️ Назад к тарифам', 'pay_back_to_plans')],
            [Markup.button.callback('🏠 В меню', 'back_to_main')],
          ]),
        );
      } catch (error: unknown) {
        args.logger.error('Error handling pay_with:', error);
        await ctx.answerCbQuery(BotMessages.paymentCreateCbErrorText);
        await ctx.reply(BotMessages.errorTryLaterText);
      }
    },
  );

}

