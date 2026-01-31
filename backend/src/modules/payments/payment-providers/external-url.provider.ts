import type { ConfigService } from '@nestjs/config';
import type { CreatePaymentIntentArgs, CreatePaymentIntentResult } from './payment-provider.types';
import { buildExternalPaymentSignature } from './external-url-signature';

export async function createExternalUrlPaymentIntent(args: {
  config: ConfigService;
  data: CreatePaymentIntentArgs;
}): Promise<CreatePaymentIntentResult> {
  // Заглушка: внешний провайдер оплаты (сайт/агрегатор/касса).
  // Пока возвращаем ссылку (если настроена), иначе сообщаем что провайдер не сконфигурирован.
  const base = args.config.get<string>('PAYMENTS_EXTERNAL_URL') || '';
  if (!base) {
    return {
      provider: 'EXTERNAL_URL',
      type: 'UNSUPPORTED',
      reason: 'External payment is not configured yet',
    };
  }

  const secret = args.config.get<string>('PAYMENTS_EXTERNAL_URL_SECRET') || '';
  if (!secret) {
    return {
      provider: 'EXTERNAL_URL',
      type: 'UNSUPPORTED',
      reason: 'External payment secret is not configured yet',
    };
  }

  const url = new URL(base);
  const ts = Math.floor(Date.now() / 1000);
  const userId = args.data.vpnUserId;
  const planId = args.data.planId;
  const sig = buildExternalPaymentSignature({ userId, planId, ts, secret });

  url.searchParams.set('userId', userId);
  url.searchParams.set('planId', planId);
  url.searchParams.set('ts', String(ts));
  url.searchParams.set('sig', sig);

  return { provider: 'EXTERNAL_URL', type: 'EXTERNAL_URL', paymentUrl: url.toString() };
}

