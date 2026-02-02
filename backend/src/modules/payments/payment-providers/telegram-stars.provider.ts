import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import type { BotService } from '../../bot/bot.service';
import type { CreatePaymentIntentArgs, CreatePaymentIntentResult } from './payment-provider.types';
import { buildTelegramStarsInvoicePayload } from '../telegram-stars/telegram-stars.payload';
import { createTelegramStarsInvoiceLink } from '../telegram-stars/telegram-bot-api';

export async function createTelegramStarsPaymentIntent(args: {
  prisma: PrismaService;
  config: ConfigService;
  botService: BotService;
  data: CreatePaymentIntentArgs;
}): Promise<CreatePaymentIntentResult> {
  // Legacy provider wrapper (kept for compatibility): now creates PaymentIntent record
  // so that successful_payment can be processed via PaymentIntentsService flow.
  const plan = await args.prisma.plan.findUnique({
    where: { id: args.data.planId },
    include: { variants: { where: { active: true } } },
  });
  if (!plan || !plan.active || plan.isTrial) {
    return { provider: 'TELEGRAM_STARS', type: 'UNSUPPORTED', reason: 'Plan is not available' };
  }

  const starsVariant = (plan as any).variants?.find((v: any) => v.currency === 'XTR') ?? null;
  if (!starsVariant) {
    return {
      provider: 'TELEGRAM_STARS',
      type: 'UNSUPPORTED',
      reason: 'This plan has no Telegram Stars variant (currency XTR)',
    };
  }

  const token = await args.botService.getToken();
  if (!token) {
    return { provider: 'TELEGRAM_STARS', type: 'UNSUPPORTED', reason: 'Bot token not configured' };
  }

  const createdIntent = await (args.prisma as any).paymentIntent.create({
    data: {
      vpnUserId: args.data.vpnUserId,
      planId: plan.id,
      variantId: starsVariant.id,
      provider: 'TELEGRAM_STARS',
      amount: Number(starsVariant.price),
      currency: 'XTR',
      status: 'PENDING',
    },
  });

  const secret = args.config.get<string>('PAYMENTS_PAYLOAD_SECRET') || token;
  const payload = buildTelegramStarsInvoicePayload({
    intentId: String(createdIntent.id),
    userId: args.data.vpnUserId,
    planId: plan.id,
    variantId: starsVariant.id,
    issuedAt: Date.now(),
    secret,
  });

  const invoiceLink = await createTelegramStarsInvoiceLink({
    token,
    title: `VPN — ${plan.name}`,
    description: `Подписка на ${plan.periodDays} дней`,
    payload,
    currency: 'XTR',
    prices: [{ label: plan.name, amount: starsVariant.price }],
  });

  await (args.prisma as any).paymentIntent.update({
    where: { id: createdIntent.id },
    data: {
      invoiceLink,
      payload,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    },
  });

  return { provider: 'TELEGRAM_STARS', type: 'INVOICE_LINK', invoiceLink };
}

