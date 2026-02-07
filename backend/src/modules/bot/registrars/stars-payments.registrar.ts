import { scheduleDeleteMessageFromReply } from '../delete-after.utils';
import type { TelegramRegistrarDeps } from './telegram-registrar.deps';
import { bm, pm } from '../messages/common.messages';
import { verifyTelegramStarsInvoicePayload } from '../../payments/telegram-stars/telegram-stars.payload';
import { botLangFromCtx, extractTelegramLanguageCode } from '../i18n/bot-lang';

export function registerTelegramStarsPayments(args: TelegramRegistrarDeps) {
  const secret = args.config.get<string>('PAYMENTS_PAYLOAD_SECRET') || args.botToken;

  // 1) pre_checkout_query: подтверждаем/отклоняем оплату
  args.bot.on('pre_checkout_query', async (ctx: any) => {
    const lang = botLangFromCtx(ctx);
    const telegramId = String(ctx?.from?.id ?? ctx?.preCheckoutQuery?.from?.id ?? '');
    if (telegramId) void args.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, extractTelegramLanguageCode(ctx));
    try {
      const q = ctx?.preCheckoutQuery;
      const payload = String(q?.invoice_payload ?? '');
      const data = verifyTelegramStarsInvoicePayload({ payload, secret });
      if (!data) {
        await ctx.answerPreCheckoutQuery(false, lang === 'en' ? 'Invalid payment. Please try again.' : 'Некорректный платеж. Попробуйте заново.');
        return;
      }

      // Защита: инвойс привязан к конкретному пользователю (telegramId)
      const payerTelegramId = String(q?.from?.id ?? ctx?.from?.id ?? '');
      const intent = await (args.prisma as any).paymentIntent.findUnique({ where: { id: data.intentId } });
      if (!intent || intent.provider !== 'TELEGRAM_STARS') {
        await ctx.answerPreCheckoutQuery(false, lang === 'en' ? 'Invalid payment. Please try again.' : 'Некорректный платеж. Попробуйте заново.');
        return;
      }
      const owner = await args.prisma.vpnUser.findUnique({ where: { id: intent.vpnUserId } });
      if (!owner || !owner.telegramId || String(owner.telegramId) !== payerTelegramId) {
        await ctx.answerPreCheckoutQuery(
          false,
          lang === 'en'
            ? 'This invoice is for another user. Please open payment again.'
            : 'Этот счёт предназначен для другого пользователя. Откройте оплату заново.',
        );
        return;
      }

      const plan = await args.prisma.plan.findUnique({ where: { id: intent.planId } });
      if (!plan || !plan.active || plan.isTrial) {
        await ctx.answerPreCheckoutQuery(false, lang === 'en' ? 'Plan is unavailable.' : 'Тариф недоступен.');
        return;
      }

      const variant = await (args.prisma as any).planVariant.findUnique({ where: { id: intent.variantId } });
      if (!variant || !variant.active || variant.planId !== intent.planId) {
        await ctx.answerPreCheckoutQuery(false, lang === 'en' ? 'Plan variant is unavailable.' : 'Вариант тарифа недоступен.');
        return;
      }

      const amount = Number(q?.total_amount);
      const currency = String(q?.currency ?? '');
      if (currency !== variant.currency || amount !== variant.price) {
        await ctx.answerPreCheckoutQuery(
          false,
          lang === 'en' ? 'Payment amount mismatch. Please try again.' : 'Сумма платежа не совпадает. Попробуйте заново.',
        );
        return;
      }

      await ctx.answerPreCheckoutQuery(true);
    } catch (e) {
      args.logger.error('pre_checkout_query handler failed', e);
      try {
        await ctx.answerPreCheckoutQuery(false, bm(lang).errorTryLaterText);
      } catch {
        // ignore
      }
    }
  });

  // 2) successful_payment: создаём payment+subscription (идемпотентно)
  args.bot.on('successful_payment', async (ctx: any) => {
    const lang = botLangFromCtx(ctx);
    const telegramId = String(ctx?.from?.id ?? '');
    if (telegramId) void args.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, extractTelegramLanguageCode(ctx));
    try {
      const sp = ctx?.message?.successful_payment;
      const telegramChargeId = String(sp?.telegram_payment_charge_id ?? '');
      const payload = String(sp?.invoice_payload ?? '');
      const amount = Number(sp?.total_amount);
      const currency = String(sp?.currency ?? '');

      if (!telegramChargeId || !payload) return;

      const data = verifyTelegramStarsInvoicePayload({ payload, secret });
      if (!data) {
        await ctx.reply(
          lang === 'en'
            ? '⚠️ Payment received, but we could not verify order details. Contact support: /support'
            : '⚠️ Платёж получен, но не удалось подтвердить данные заказа. Напишите в поддержку: /support',
        );
        return;
      }

      const user = telegramId ? await args.usersService.findByTelegramId(telegramId) : null;
      if (!user) {
        await ctx.reply(bm(lang).userNotFoundUseStartText);
        return;
      }

      // Защита: intentId должен принадлежать этому пользователю
      const intent = await (args.prisma as any).paymentIntent.findUnique({ where: { id: data.intentId } });
      if (!intent || intent.provider !== 'TELEGRAM_STARS' || intent.vpnUserId !== user.id) {
        args.logger.warn(`Stars payment intent mismatch: intentId=${data.intentId}, userId=${user.id}`);
        await ctx.reply(
          lang === 'en'
            ? '⚠️ Payment received, but we could not match the order. Contact support: /support'
            : '⚠️ Платёж получен, но не удалось сопоставить заказ. Напишите в поддержку: /support',
        );
        return;
      }

      await args.paymentIntentsService.handleTelegramStarsSuccessfulPayment({
        botToken: args.botToken,
        telegramPaymentChargeId: telegramChargeId,
        payload,
        amount,
        currency,
      });

      const sent = await ctx.reply(pm(lang).paymentSuccessBotText);
      scheduleDeleteMessageFromReply(args.bot.telegram, sent);
      await args.showMainMenu(ctx, user);
    } catch (e) {
      args.logger.error('successful_payment handler failed', e);
      try {
        await ctx.reply(bm(lang).errorTryLaterText);
      } catch {
        // ignore
      }
    }
  });
}

