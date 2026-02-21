import { scheduleDeleteMessageFromReply } from '../delete-after.utils';
import type { TelegramRegistrarDeps } from './telegram-registrar.deps';
import { getPaidPlansWithFallback } from '../plans/paid-plans.utils';
import { bm, pm } from '../messages/common.messages';
import { getMarkup } from '../telegram-markup.utils';
import { editOrReplyHtml } from '../telegram-reply.utils';
import type { TelegramCallbackCtx, TelegramCallbackMatch, TelegramMessageCtx } from '../telegram-runtime.types';
import { getErrorMessage } from '../telegram-error.utils';
import {
  formatPlanGroupButtonLabel,
  groupPlansByNameAndPeriod,
  pickVariantForCryptoCloudByLang,
  pickVariantForPlatega,
  pickVariantForStars,
} from '../plans/plan-grouping.utils';
import type { PlanLike } from '../bot-domain.types';
import { botLangFromCtx, extractTelegramLanguageCode } from '../i18n/bot-lang';
import { ui } from '../messages/ui.messages';

export function registerPaymentsHandlers(args: TelegramRegistrarDeps) {
  async function renderPayPlans(args2: {
    ctx: TelegramMessageCtx;
    telegramId: string;
    mode: 'reply' | 'editOrReply';
  }) {
    const lang = botLangFromCtx(args2.ctx);
    const user = await args.usersService.findByTelegramId(args2.telegramId);
    if (!user) {
      await args.editLastOrReply(args2.ctx, bm(lang).userNotFoundUseStartText);
      return;
    }

    const providersAllowed = await args.paymentIntentsService.getAvailableProvidersForTelegramLanguageCode({
      telegramLanguageCode: user.telegramLanguageCode ?? null,
    });

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
      if (args2.mode === 'reply') await args.editLastOrReply(args2.ctx, bm(lang).noPaidPlansHtml);
      else await editOrReplyHtml(args2.ctx as any, bm(lang).noPaidPlansHtml);
      return;
    }

    const Markup = await getMarkup();
    const groups = groupPlansByNameAndPeriod(paidPlans);
    const buttons = groups.map((g) => {
      const label = formatPlanGroupButtonLabel(g, {
        showPlatega: providersAllowed.PLATEGA,
        showCryptoCloud: providersAllowed.CRYPTOCLOUD,
        showStars: providersAllowed.TELEGRAM_STARS,
        cryptoTelegramLanguageCode: user.telegramLanguageCode ?? null,
      });
      const btn: any = { text: label, callback_data: `select_plan_${g.representative.id}` };
      if ((g.representative as any).isTop) btn.style = 'success';
      return [btn];
    });
    buttons.push([Markup.button.callback(ui(lang).backToMenuBtn, 'back_to_main')]);

    const text =
      lang === 'en'
        ? `💳 <b>Payment</b>\n\n` +
          `1) Choose a plan\n` +
          `2) Choose a payment method\n\n` +
          `After payment the subscription activates automatically.`
        : `💳 <b>Оплата</b>\n\n` +
          `1) Выберите тариф\n` +
          `2) Выберите способ оплаты\n\n` +
          `После оплаты подписка активируется автоматически.`;

    if (args2.mode === 'reply') {
      await args.editLastOrReply(args2.ctx, text, Markup.inlineKeyboard(buttons));
    } else {
      await editOrReplyHtml(args2.ctx as any, text, Markup.inlineKeyboard(buttons));
    }
  }

  // /pay - показываем тарифы
  args.bot.command('pay', async (ctx: TelegramMessageCtx) => {
    const telegramId = ctx.from.id.toString();
    const lang = botLangFromCtx(ctx);
    void args.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, extractTelegramLanguageCode(ctx));

    // Удаляем команду пользователя для чистоты чата
    const chatId = ctx.chat?.id;
    const msgId = ctx.message?.message_id;
    if (chatId != null && msgId != null) {
      args.bot.telegram.deleteMessage(chatId, msgId).catch(() => {});
    }

    try {
      await renderPayPlans({ ctx, telegramId, mode: 'reply' });
    } catch (error: unknown) {
      args.logger.error('Error handling /pay command:', error);
      await ctx.reply(bm(lang).errorTryLaterText);
    }
  });

  // Назад к списку тарифов (из экрана выбора способа оплаты/оплаты)
  args.bot.action('pay_back_to_plans', async (ctx: TelegramCallbackCtx) => {
    const telegramId = ctx.from.id.toString();
    const lang = botLangFromCtx(ctx);
    void args.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, extractTelegramLanguageCode(ctx));
    try {
      await ctx.answerCbQuery(bm(lang).cbProcessingText);
      await renderPayPlans({ ctx: ctx as any, telegramId, mode: 'editOrReply' });
    } catch (error: unknown) {
      args.logger.error('Error handling pay_back_to_plans:', error);
      await ctx.answerCbQuery(bm(lang).errorCbText);
    }
  });

  // Выбор тарифа
  args.bot.action(/^select_plan_(.+)$/, async (ctx: TelegramCallbackCtx<TelegramCallbackMatch>) => {
    const planId = ctx.match[1];
    const telegramId = ctx.from.id.toString();
    const lang = botLangFromCtx(ctx);
    void args.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, extractTelegramLanguageCode(ctx));

    try {
      await ctx.answerCbQuery(bm(lang).cbProcessingText);

      const user = await args.usersService.findByTelegramId(telegramId);

      if (!user) {
        await ctx.reply(bm(lang).userNotFoundUseStartText);
        return;
      }

      const plan = await args.prisma.plan.findUnique({
        where: { id: planId },
        include: { variants: { where: { active: true }, orderBy: { price: 'asc' } } },
      });

      if (!plan || !plan.active || plan.isTrial) {
        await ctx.reply(bm(lang).planUnavailableText);
        return;
      }

      const variants = (((plan as any) as PlanLike).variants ?? []) as NonNullable<PlanLike['variants']>;
      const starsVariant = pickVariantForStars(variants) ?? null;
      const plategaVariant = pickVariantForPlatega(variants) ?? null;
      const cryptoVariant = pickVariantForCryptoCloudByLang(variants, user.telegramLanguageCode ?? null) ?? null;

      const Markup = await getMarkup();
      const methodButtons: Array<Array<ReturnType<typeof Markup.button.callback>>> = [];

      const providersAllowed = await args.paymentIntentsService.getAvailableProvidersForTelegramLanguageCode({
        telegramLanguageCode: user.telegramLanguageCode ?? null,
      });

      if (starsVariant && providersAllowed.TELEGRAM_STARS)
        methodButtons.push([
          Markup.button.callback(
            `⭐ Stars — ${args.esc(starsVariant.price)} XTR`,
            `pay_with_TELEGRAM_STARS_${starsVariant.id}`,
          ),
        ]);
      if (plategaVariant && providersAllowed.PLATEGA)
        methodButtons.push([
          Markup.button.callback(
            lang === 'en'
              ? `💳 Card/Instant — ${args.esc(plategaVariant.price)} ${args.esc(plategaVariant.currency)}`
              : `💳 Карта/СБП — ${args.esc(plategaVariant.price)} ${args.esc(plategaVariant.currency)}`,
            `pay_with_PLATEGA_${plategaVariant.id}`,
          ),
        ]);
      if (cryptoVariant && providersAllowed.CRYPTOCLOUD)
        methodButtons.push([
          Markup.button.callback(
            (() => {
              const c = String(cryptoVariant.currency ?? '').toUpperCase();
              const labelCur = c === 'USD' ? 'USDT' : c || cryptoVariant.currency;
              return lang === 'en'
                ? `🪙 Crypto — ${args.esc(cryptoVariant.price)} ${args.esc(labelCur)}`
                : `🪙 Крипто — ${args.esc(cryptoVariant.price)} ${args.esc(labelCur)}`;
            })(),
            `pay_with_CRYPTOCLOUD_${cryptoVariant.id}`,
          ),
        ]);

      if (methodButtons.length === 0) {
        await editOrReplyHtml(ctx, bm(lang).noPaidPlansHtml);
        return;
      }

      const rows: any[] = [...methodButtons];
      rows.push([Markup.button.callback(lang === 'en' ? '⬅️ Back to plans' : '⬅️ Назад к тарифам', 'pay_back_to_plans')]);
      rows.push([Markup.button.callback(ui(lang).backToMenuBtn, 'back_to_main')]);

      const sent = await editOrReplyHtml(
        ctx,
        lang === 'en'
          ? `💳 <b>${args.esc(plan.name)}</b>\n\nChoose a payment method:`
          : `💳 <b>${args.esc(plan.name)}</b>\n\n` + `Выберите способ оплаты:`,
        Markup.inlineKeyboard(rows),
      );
      scheduleDeleteMessageFromReply(args.bot.telegram, sent, ctx);
    } catch (error: unknown) {
      args.logger.error('Error handling plan selection:', error);
      await ctx.answerCbQuery(bm(lang).paymentCreateCbErrorText);
      await ctx.reply(
        lang === 'en'
          ? `❌ Payment processing error.\n\n` +
            `Error: ${getErrorMessage(error) || 'Unknown error'}\n\n` +
            `Try again later or contact support.`
          : `❌ Произошла ошибка при обработке платежа.\n\n` +
            `Ошибка: ${getErrorMessage(error) || 'Неизвестная ошибка'}\n\n` +
            `Попробуйте позже или обратитесь к администратору.`,
      );
    }
  });

  // Выбор способа оплаты
  args.bot.action(
    /^pay_with_(TELEGRAM_STARS|PLATEGA|CRYPTOCLOUD)_(.+)$/,
    async (ctx: TelegramCallbackCtx<TelegramCallbackMatch>) => {
      const provider = ctx.match[1] as 'TELEGRAM_STARS' | 'PLATEGA' | 'CRYPTOCLOUD';
      const variantId = ctx.match[2];
      const telegramId = ctx.from.id.toString();
      const lang = botLangFromCtx(ctx);
      void args.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, extractTelegramLanguageCode(ctx));

      try {
        await ctx.answerCbQuery(bm(lang).cbProcessingText);

        const user = await args.usersService.findByTelegramId(telegramId);
        if (!user) {
          await ctx.reply(bm(lang).userNotFoundUseStartText);
          return;
        }

        const variant = await (args.prisma as any).planVariant.findUnique({
          where: { id: variantId },
          include: { plan: true },
        });

        const plan = variant?.plan;
        if (!variant || !plan || !plan.active || plan.isTrial || !variant.active) {
          await ctx.reply(bm(lang).planUnavailableText);
          return;
        }

        if (provider === 'TELEGRAM_STARS') {
          if (variant.currency !== 'XTR') {
            await editOrReplyHtml(
              ctx,
              lang === 'en'
                ? `⚠️ This variant can’t be paid with Stars (currency: <b>${args.esc(variant.currency)}</b>).`
                : `⚠️ Этот вариант нельзя оплатить через Stars (валюта: <b>${args.esc(variant.currency)}</b>).`,
            );
            return;
          }

          const intent = await args.paymentIntentsService.createForVariant({
            vpnUserId: user.id,
            variantId: variant.id,
            provider: 'TELEGRAM_STARS',
            botToken: args.botToken,
          });
          if ('type' in intent && intent.type === 'UNSUPPORTED') {
            await editOrReplyHtml(
              ctx,
              lang === 'en'
                ? `⚠️ Stars payment is not available yet.\n\n${args.esc(intent.reason)}`
                : `⚠️ Оплата Stars пока недоступна.\n\n${args.esc(intent.reason)}`,
            );
            return;
          }
          if (!('invoiceLink' in intent)) {
            await editOrReplyHtml(ctx, lang === 'en' ? `⚠️ Stars payment is not available yet.` : `⚠️ Оплата Stars пока недоступна.`);
            return;
          }

          // Одно сообщение: сначала «Счёт отправлен...», через 2 сек — инфо о подписке и кнопка-ссылка на инвойс (без второго сообщения в чат)
          const billSentText = pm(lang).billSentStarsTemplate.replace('{price}', args.esc(variant.price));
          const MarkupStars = await getMarkup();
          await editOrReplyHtml(
            ctx,
            billSentText,
            MarkupStars.inlineKeyboard([[MarkupStars.button.callback(ui(lang).backToMenuBtn, 'back_to_main')]]),
          );

          const subscriptionText = pm(lang).starsSubscriptionScreenTemplate
            .replace(/{planName}/g, args.esc(plan.name))
            .replace(/{periodDays}/g, String(plan.periodDays))
            .replace(/{price}/g, args.esc(variant.price));
          const payButtonLabel = pm(lang).starsPayButtonLabel.replace('{price}', args.esc(variant.price));
          const invoiceLink = intent.invoiceLink;

          setTimeout(async () => {
            const sent = await editOrReplyHtml(
              ctx,
              subscriptionText,
              MarkupStars.inlineKeyboard([
                [MarkupStars.button.url(payButtonLabel, invoiceLink)],
                [MarkupStars.button.callback(ui(lang).backToMenuBtn, 'back_to_main')],
              ]),
            ).catch(() => null);
            if (sent) scheduleDeleteMessageFromReply(args.bot.telegram, sent, ctx);
          }, 2000);
          return;
        }

        // External providers (PLATEGA / CRYPTOCLOUD)
        if (variant.currency === 'XTR') {
          await editOrReplyHtml(
            ctx,
            lang === 'en'
              ? `⚠️ This plan is for Stars. Please choose Stars payment.`
              : `⚠️ Этот тариф предназначен для Stars. Выберите оплату Stars.`,
          );
          return;
        }

        const intent = await args.paymentIntentsService.createForVariant({
          vpnUserId: user.id,
          variantId: variant.id,
          provider,
        });
        if ('type' in intent && intent.type === 'UNSUPPORTED') {
          await editOrReplyHtml(
            ctx,
            lang === 'en'
              ? `⚠️ Payment is not available yet.\n\n${args.esc(intent.reason)}`
              : `⚠️ Оплата пока недоступна.\n\n${args.esc(intent.reason)}`,
          );
          return;
        }
        if (!('paymentUrl' in intent)) {
          await editOrReplyHtml(ctx, lang === 'en' ? `⚠️ Payment is not available yet.` : `⚠️ Оплата пока недоступна.`);
          return;
        }

        const Markup = await getMarkup();
        const instructionsHtml =
          provider === 'PLATEGA'
            ? pm(lang).plategaInstructionsHtml
            : lang === 'en'
              ? `🪙 <b>CryptoCloud</b>\n\nOpen the payment page and complete payment.\n\nAfter payment your subscription activates automatically.`
              : `🪙 <b>CryptoCloud</b>\n\nОткройте страницу оплаты и завершите платёж.\n\nПосле оплаты подписка активируется автоматически.`;
        const btnLabel =
          provider === 'PLATEGA' ? pm(lang).openPaymentButtonLabel : lang === 'en' ? 'Open payment page' : 'Открыть оплату';

        const sent = await editOrReplyHtml(
          ctx,
          instructionsHtml,
          Markup.inlineKeyboard([
            [Markup.button.url(btnLabel, intent.paymentUrl)],
            [Markup.button.callback(lang === 'en' ? '⬅️ Back to plans' : '⬅️ Назад к тарифам', 'pay_back_to_plans')],
            [Markup.button.callback(ui(lang).backToMenuBtn, 'back_to_main')],
          ]),
        );
        scheduleDeleteMessageFromReply(args.bot.telegram, sent, ctx);
      } catch (error: unknown) {
        args.logger.error('Error handling pay_with:', error);
        await ctx.answerCbQuery(bm(lang).paymentCreateCbErrorText);
        await ctx.reply(bm(lang).errorTryLaterText);
      }
    },
  );

}

