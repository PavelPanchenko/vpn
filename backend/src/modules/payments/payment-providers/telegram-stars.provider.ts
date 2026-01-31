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

  const secret = args.config.get<string>('PAYMENTS_PAYLOAD_SECRET') || token;
  const payload = buildTelegramStarsInvoicePayload({
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

  return { provider: 'TELEGRAM_STARS', type: 'INVOICE_LINK', invoiceLink };
}

