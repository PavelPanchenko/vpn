import { scheduleDeleteMessageFromReply } from '../delete-after.utils';
import type { TelegramRegistrarDeps } from './telegram-registrar.deps';
import { BotMessages, PaymentMessages } from '../messages/common.messages';
import { verifyTelegramStarsInvoicePayload } from '../../payments/telegram-stars/telegram-stars.payload';

export function registerTelegramStarsPayments(args: TelegramRegistrarDeps) {
  const secret = args.config.get<string>('PAYMENTS_PAYLOAD_SECRET') || args.botToken;

  // 1) pre_checkout_query: подтверждаем/отклоняем оплату
  args.bot.on('pre_checkout_query', async (ctx: any) => {
    try {
      const q = ctx?.preCheckoutQuery;
      const payload = String(q?.invoice_payload ?? '');
      const data = verifyTelegramStarsInvoicePayload({ payload, secret });
      if (!data) {
        await ctx.answerPreCheckoutQuery(false, 'Некорректный платеж. Попробуйте заново.');
        return;
      }

      // Защита: инвойс привязан к конкретному пользователю (telegramId)
      const payerTelegramId = String(q?.from?.id ?? ctx?.from?.id ?? '');
      const intent = await (args.prisma as any).paymentIntent.findUnique({ where: { id: data.intentId } });
      if (!intent || intent.provider !== 'TELEGRAM_STARS') {
        await ctx.answerPreCheckoutQuery(false, 'Некорректный платеж. Попробуйте заново.');
        return;
      }
      const owner = await args.prisma.vpnUser.findUnique({ where: { id: intent.vpnUserId } });
      if (!owner || !owner.telegramId || String(owner.telegramId) !== payerTelegramId) {
        await ctx.answerPreCheckoutQuery(false, 'Этот счёт предназначен для другого пользователя. Откройте оплату заново.');
        return;
      }

      const plan = await args.prisma.plan.findUnique({ where: { id: intent.planId } });
      if (!plan || !plan.active || plan.isTrial) {
        await ctx.answerPreCheckoutQuery(false, 'Тариф недоступен.');
        return;
      }

      const variant = await (args.prisma as any).planVariant.findUnique({ where: { id: intent.variantId } });
      if (!variant || !variant.active || variant.planId !== intent.planId) {
        await ctx.answerPreCheckoutQuery(false, 'Вариант тарифа недоступен.');
        return;
      }

      const amount = Number(q?.total_amount);
      const currency = String(q?.currency ?? '');
      if (currency !== variant.currency || amount !== variant.price) {
        await ctx.answerPreCheckoutQuery(false, 'Сумма платежа не совпадает. Попробуйте заново.');
        return;
      }

      await ctx.answerPreCheckoutQuery(true);
    } catch (e) {
      args.logger.error('pre_checkout_query handler failed', e);
      try {
        await ctx.answerPreCheckoutQuery(false, BotMessages.errorTryLaterText);
      } catch {
        // ignore
      }
    }
  });

  // 2) successful_payment: создаём payment+subscription (идемпотентно)
  args.bot.on('successful_payment', async (ctx: any) => {
    try {
      const sp = ctx?.message?.successful_payment;
      const telegramChargeId = String(sp?.telegram_payment_charge_id ?? '');
      const payload = String(sp?.invoice_payload ?? '');
      const amount = Number(sp?.total_amount);
      const currency = String(sp?.currency ?? '');

      if (!telegramChargeId || !payload) return;

      const data = verifyTelegramStarsInvoicePayload({ payload, secret });
      if (!data) {
        await ctx.reply('⚠️ Платёж получен, но не удалось подтвердить данные заказа. Напишите в поддержку: /support');
        return;
      }

      const telegramId = String(ctx?.from?.id ?? '');
      const user = telegramId ? await args.usersService.findByTelegramId(telegramId) : null;
      if (!user) {
        await ctx.reply(BotMessages.userNotFoundUseStartText);
        return;
      }

      // Защита: intentId должен принадлежать этому пользователю
      const intent = await (args.prisma as any).paymentIntent.findUnique({ where: { id: data.intentId } });
      if (!intent || intent.provider !== 'TELEGRAM_STARS' || intent.vpnUserId !== user.id) {
        args.logger.warn(`Stars payment intent mismatch: intentId=${data.intentId}, userId=${user.id}`);
        await ctx.reply('⚠️ Платёж получен, но не удалось сопоставить заказ. Напишите в поддержку: /support');
        return;
      }

      await args.paymentIntentsService.handleTelegramStarsSuccessfulPayment({
        botToken: args.botToken,
        telegramPaymentChargeId: telegramChargeId,
        payload,
        amount,
        currency,
      });

      const sent = await ctx.reply(PaymentMessages.paymentSuccessBotText);
      scheduleDeleteMessageFromReply(args.bot.telegram, sent);
      await args.showMainMenu(ctx, user);
    } catch (e) {
      args.logger.error('successful_payment handler failed', e);
      try {
        await ctx.reply(BotMessages.errorTryLaterText);
      } catch {
        // ignore
      }
    }
  });
}

