import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../../users/users.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { AccessRevokerService } from '../access/access-revoker.service';
import { plategaCreateTransaction, type PlategaPaymentStatus } from '../platega/platega-api';
import { buildPlategaPayload, verifyPlategaPayload } from '../platega/platega-payload';
import { buildTelegramStarsInvoicePayload, verifyTelegramStarsInvoicePayload } from '../telegram-stars/telegram-stars.payload';
import { createTelegramStarsInvoiceLink } from '../telegram-stars/telegram-bot-api';
import type { CryptoCloudPostbackBody } from '../cryptocloud/cryptocloud-postback';
import { cryptocloudCreateInvoice, parseCryptoCloudDateUtc } from '../cryptocloud/cryptocloud-api';
import { isCurrencySupportedByProvider } from '../payment-providers/provider-currency.rules';
import { normalizeCurrency } from '../../../common/currencies';

type CreateIntentResult =
  | { provider: 'TELEGRAM_STARS'; intentId: string; invoiceLink: string }
  | { provider: 'PLATEGA'; intentId: string; paymentUrl: string }
  | { provider: 'CRYPTOCLOUD'; intentId: string; paymentUrl: string }
  | { provider: 'PLATEGA' | 'TELEGRAM_STARS' | 'CRYPTOCLOUD'; intentId: string; type: 'UNSUPPORTED'; reason: string };

function parseHhMmSsToMs(v: string | undefined | null): number | null {
  if (!v) return null;
  const m = String(v).match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3]);
  if (![hh, mm, ss].every(Number.isFinite)) return null;
  return (hh * 3600 + mm * 60 + ss) * 1000;
}

@Injectable()
export class PaymentIntentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly users: UsersService,
    private readonly subscriptions: SubscriptionsService,
    private readonly accessRevoker: AccessRevokerService,
  ) {}

  async listAdmin() {
    return (this.prisma as any).paymentIntent.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        vpnUser: { include: { server: true, userServers: { include: { server: true } } } },
        plan: true,
      },
    });
  }

  async getAdmin(id: string) {
    const it = await (this.prisma as any).paymentIntent.findUnique({
      where: { id },
      include: {
        vpnUser: { include: { server: true, userServers: { include: { server: true } } } },
        plan: true,
        payments: true,
      },
    });
    if (!it) throw new NotFoundException('Payment intent not found');
    return it;
  }

  async markExpiredIntents() {
    const now = new Date();
    await (this.prisma as any).paymentIntent.updateMany({
      where: { status: 'PENDING', expiresAt: { not: null, lt: now } },
      data: { status: 'EXPIRED' },
    });
  }

  private normalizeLang(code: string | null | undefined): 'ru' | 'en' | 'uk' | null {
    const v = String(code ?? '').trim().toLowerCase();
    if (!v) return null;
    if (v.startsWith('ru')) return 'ru';
    if (v.startsWith('uk')) return 'uk';
    if (v.startsWith('en')) return 'en';
    return null;
  }

  private async getActivePaymentSettings(): Promise<{
    paymentsStarsEnabled: boolean;
    paymentsPlategaEnabled: boolean;
    paymentsPlategaAllowedLangs: Array<'ru' | 'en' | 'uk'>;
  }> {
    const cfg = await this.prisma.botConfig.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      select: {
        paymentsStarsEnabled: true,
        paymentsPlategaEnabled: true,
        paymentsPlategaAllowedLangs: true,
      },
    });
    const langsRaw = (cfg?.paymentsPlategaAllowedLangs ?? ['ru']).map((x) => String(x).trim().toLowerCase());
    const langs = langsRaw.filter((x) => x === 'ru' || x === 'en' || x === 'uk') as Array<'ru' | 'en' | 'uk'>;
    return {
      paymentsStarsEnabled: cfg?.paymentsStarsEnabled ?? true,
      paymentsPlategaEnabled: cfg?.paymentsPlategaEnabled ?? true,
      paymentsPlategaAllowedLangs: langs.length ? langs : ['ru'],
    };
  }

  private async getActivePaymentMethods(): Promise<
    Array<{ key: 'TELEGRAM_STARS' | 'PLATEGA' | 'CRYPTOCLOUD'; enabled: boolean; allowedLangs: Array<'ru' | 'en' | 'uk'> }>
  > {
    const cfg = await (this.prisma as any).botConfig.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!cfg?.id) return [];
    const rows = await (this.prisma as any).botPaymentMethod.findMany({
      where: { botConfigId: cfg.id },
      orderBy: { key: 'asc' },
      select: { key: true, enabled: true, allowedLangs: true },
    });
    return (rows ?? []).map((r: any) => {
      const rawKey = String(r.key ?? '').trim().toUpperCase();
      const key: 'TELEGRAM_STARS' | 'PLATEGA' | 'CRYPTOCLOUD' =
        rawKey === 'PLATEGA' ? 'PLATEGA' : rawKey === 'CRYPTOCLOUD' ? 'CRYPTOCLOUD' : 'TELEGRAM_STARS';
      const langsRaw = Array.isArray(r.allowedLangs) ? r.allowedLangs : [];
      const langs = langsRaw
        .map((x: any) => String(x).trim().toLowerCase())
        .filter((x: string) => x === 'ru' || x === 'en' || x === 'uk') as Array<'ru' | 'en' | 'uk'>;
      return { key, enabled: Boolean(r.enabled), allowedLangs: langs };
    });
  }

  private isPlategaAllowedForLang(args: { telegramLanguageCode: string | null; allowedLangs: Array<'ru' | 'en' | 'uk'> }): boolean {
    const lang = this.normalizeLang(args.telegramLanguageCode);
    if (!lang) {
      // Без языка не ломаем существующий UX: разрешаем внешний провайдер.
      return true;
    }
    return args.allowedLangs.includes(lang);
  }

  async getAvailableProvidersForTelegramLanguageCode(args: { telegramLanguageCode: string | null }): Promise<{
    TELEGRAM_STARS: boolean;
    PLATEGA: boolean;
    CRYPTOCLOUD: boolean;
  }> {
    const methods = await this.getActivePaymentMethods();
    // Если таблица ещё не заполнена — fallback на старые поля BotConfig (совместимость).
    if (!methods.length) {
      const s = await this.getActivePaymentSettings();
      return {
        TELEGRAM_STARS: Boolean(s.paymentsStarsEnabled),
        PLATEGA:
          Boolean(s.paymentsPlategaEnabled) &&
          this.isPlategaAllowedForLang({ telegramLanguageCode: args.telegramLanguageCode, allowedLangs: s.paymentsPlategaAllowedLangs }),
        CRYPTOCLOUD: false,
      };
    }

    const stars = methods.find((m) => m.key === 'TELEGRAM_STARS') ?? { enabled: true, allowedLangs: [] as any[] };
    const platega = methods.find((m) => m.key === 'PLATEGA') ?? { enabled: true, allowedLangs: ['ru'] as any };
    const cc = methods.find((m) => m.key === 'CRYPTOCLOUD') ?? { enabled: false, allowedLangs: [] as any[] };
    const lang = this.normalizeLang(args.telegramLanguageCode);
    const plategaAllowed = platega.allowedLangs.length === 0 ? true : lang ? platega.allowedLangs.includes(lang) : true;
    const ccAllowed = cc.allowedLangs.length === 0 ? true : lang ? cc.allowedLangs.includes(lang) : true;
    return {
      TELEGRAM_STARS: Boolean(stars.enabled),
      PLATEGA: Boolean(platega.enabled) && plategaAllowed,
      CRYPTOCLOUD: Boolean(cc.enabled) && ccAllowed,
    };
  }

  /**
   * Create PENDING intent + return checkout details for Mini/Bot.
   * For Stars, caller must provide botToken (because bot token is stored encrypted in DB).
   */
  async createForVariant(args: {
    vpnUserId: string;
    variantId: string;
    provider?: 'TELEGRAM_STARS' | 'PLATEGA' | 'CRYPTOCLOUD';
    botToken?: string; // required for TELEGRAM_STARS invoice creation
  }): Promise<CreateIntentResult> {
    const user = await this.prisma.vpnUser.findUnique({ where: { id: args.vpnUserId } });
    if (!user) throw new NotFoundException('User not found');

    const variant = await (this.prisma as any).planVariant.findUnique({
      where: { id: args.variantId },
      include: { plan: true },
    });
    const plan = variant?.plan;
    if (!variant || !plan || !plan.active || plan.isTrial || !variant.active) {
      return { provider: 'PLATEGA', intentId: 'n/a', type: 'UNSUPPORTED', reason: 'Plan variant is not available' };
    }

    const provider = (args.provider ??
      (String(variant.provider || '').toUpperCase() === 'TELEGRAM_STARS'
        ? 'TELEGRAM_STARS'
        : String(variant.provider || '').toUpperCase() === 'CRYPTOCLOUD'
          ? 'CRYPTOCLOUD'
          : 'PLATEGA')) as 'TELEGRAM_STARS' | 'PLATEGA' | 'CRYPTOCLOUD';

    const allowed = await this.getAvailableProvidersForTelegramLanguageCode({
      telegramLanguageCode: (user as any).telegramLanguageCode ?? null,
    });
    if (provider === 'TELEGRAM_STARS' && !allowed.TELEGRAM_STARS) {
      return { provider: 'TELEGRAM_STARS', intentId: 'n/a', type: 'UNSUPPORTED', reason: 'Payment method is disabled' };
    }
    if (provider === 'PLATEGA' && !allowed.PLATEGA) {
      return { provider: 'PLATEGA', intentId: 'n/a', type: 'UNSUPPORTED', reason: 'Payment method is not available for your language' };
    }
    if (provider === 'CRYPTOCLOUD' && !allowed.CRYPTOCLOUD) {
      return { provider: 'CRYPTOCLOUD', intentId: 'n/a', type: 'UNSUPPORTED', reason: 'Payment method is disabled' };
    }

    if (provider === 'TELEGRAM_STARS' && String(variant.currency) !== 'XTR') {
      return { provider: 'TELEGRAM_STARS', intentId: 'n/a', type: 'UNSUPPORTED', reason: 'Variant is not XTR' };
    }
    if ((provider === 'PLATEGA' || provider === 'CRYPTOCLOUD') && String(variant.currency) === 'XTR') {
      return { provider, intentId: 'n/a', type: 'UNSUPPORTED', reason: 'Variant is XTR' };
    }
    const currency = normalizeCurrency(variant.currency);
    if (!isCurrencySupportedByProvider({ provider, currency })) {
      return { provider, intentId: 'n/a', type: 'UNSUPPORTED', reason: `Provider does not support currency ${currency}` };
    }

    const created = await (this.prisma as any).paymentIntent.create({
      data: {
        vpnUserId: user.id,
        planId: plan.id,
        variantId: variant.id,
        provider,
        amount: Number(variant.price),
        currency: String(variant.currency),
        status: 'PENDING',
      },
    });

    // CryptoCloud
    if (provider === 'CRYPTOCLOUD') {
      const shopId = (this.config.get<string>('CRYPTOCLOUD_SHOP_ID') || '').trim();
      if (!shopId) return { provider: 'CRYPTOCLOUD', intentId: created.id, type: 'UNSUPPORTED', reason: 'CRYPTOCLOUD_SHOP_ID is not configured' };

      const locale = this.normalizeLang((user as any).telegramLanguageCode ?? null) === 'en' ? 'en' : 'ru';
      let resp: Awaited<ReturnType<typeof cryptocloudCreateInvoice>>;
      try {
        resp = await cryptocloudCreateInvoice({
          config: this.config,
          locale,
          body: {
            shop_id: shopId,
            amount: Number(variant.price),
            currency: currency || undefined,
            order_id: String(created.id),
          },
        });
      } catch (e: unknown) {
        await (this.prisma as any).paymentIntent.update({ where: { id: created.id }, data: { status: 'CANCELED' } });
        const msg = e instanceof Error ? e.message : String(e);
        return { provider: 'CRYPTOCLOUD', intentId: created.id, type: 'UNSUPPORTED', reason: msg };
      }

      if (!resp || resp.status !== 'success' || !resp.result?.link) {
        await (this.prisma as any).paymentIntent.update({ where: { id: created.id }, data: { status: 'CANCELED' } });
        return { provider: 'CRYPTOCLOUD', intentId: created.id, type: 'UNSUPPORTED', reason: 'CryptoCloud invoice creation failed' };
      }

      const externalId = String(resp.result.uuid || resp.result.invoice_id || '').trim() || null;
      const expiresAt = parseCryptoCloudDateUtc(resp.result.expiry_date) ?? new Date(Date.now() + 24 * 60 * 60_000);

      await (this.prisma as any).paymentIntent.update({
        where: { id: created.id },
        data: {
          externalId,
          checkoutUrl: String(resp.result.link),
          expiresAt,
        },
      });

      return { provider: 'CRYPTOCLOUD', intentId: created.id, paymentUrl: String(resp.result.link) };
    }

    // Platega
    if (provider === 'PLATEGA') {
      const payloadSecret = this.config.get<string>('PAYMENTS_PAYLOAD_SECRET') || this.config.get<string>('PLATEGA_SECRET') || '';
      if (!payloadSecret) return { provider: 'PLATEGA', intentId: created.id, type: 'UNSUPPORTED', reason: 'PAYMENTS_PAYLOAD_SECRET is not configured' };

      const ok = this.config.get<string>('PLATEGA_RETURN_URL') || '';
      const fail = this.config.get<string>('PLATEGA_FAILED_URL') || '';
      const method = Number(this.config.get<string>('PLATEGA_PAYMENT_METHOD', '2'));

      const payload = buildPlategaPayload({
        v: 1,
        intentId: created.id,
        vpnUserId: user.id,
        planId: plan.id,
        variantId: variant.id,
        issuedAt: Date.now(),
        secret: payloadSecret,
      });

      let tx: Awaited<ReturnType<typeof plategaCreateTransaction>>;
      try {
        tx = await plategaCreateTransaction({
          config: this.config,
          body: {
            paymentMethod: Number.isFinite(method) ? method : 2,
            paymentDetails: { amount: Number(variant.price), currency: String(variant.currency) },
            description: `VPN — ${plan.name}`,
            return: ok || undefined,
            failedUrl: fail || undefined,
            payload,
          },
        });
      } catch (e: unknown) {
        await (this.prisma as any).paymentIntent.update({
          where: { id: created.id },
          data: { status: 'CANCELED', payload },
        });
        const msg = e instanceof Error ? e.message : String(e);
        return { provider: 'PLATEGA', intentId: created.id, type: 'UNSUPPORTED', reason: msg };
      }

      const ttlMs = parseHhMmSsToMs(tx.expiresIn) ?? 15 * 60_000;
      const expiresAt = new Date(Date.now() + ttlMs);

      await (this.prisma as any).paymentIntent.update({
        where: { id: created.id },
        data: {
          externalId: String(tx.transactionId),
          checkoutUrl: String(tx.redirect),
          payload,
          expiresAt,
        },
      });

      return { provider: 'PLATEGA', intentId: created.id, paymentUrl: String(tx.redirect) };
    }

    // Stars
    const botToken = args.botToken || '';
    if (!botToken) {
      return { provider: 'TELEGRAM_STARS', intentId: created.id, type: 'UNSUPPORTED', reason: 'Bot token not provided' };
    }
    const secret = this.config.get<string>('PAYMENTS_PAYLOAD_SECRET') || botToken;
    const payload = buildTelegramStarsInvoicePayload({
      intentId: created.id,
      issuedAt: Date.now(),
      secret,
    });

    let invoiceLink: string;
    try {
      invoiceLink = await createTelegramStarsInvoiceLink({
        token: botToken,
        title: `VPN — ${plan.name}`,
        description: `Подписка на ${plan.periodDays} дней`,
        payload,
        currency: 'XTR',
        prices: [{ label: plan.name, amount: Number(variant.price) }],
      });
    } catch (e: unknown) {
      await (this.prisma as any).paymentIntent.update({
        where: { id: created.id },
        data: { status: 'CANCELED', payload },
      });
      const msg = e instanceof Error ? e.message : String(e);
      return { provider: 'TELEGRAM_STARS', intentId: created.id, type: 'UNSUPPORTED', reason: msg };
    }

    await (this.prisma as any).paymentIntent.update({
      where: { id: created.id },
      data: { invoiceLink, payload, expiresAt: new Date(Date.now() + 15 * 60_000) },
    });

    return { provider: 'TELEGRAM_STARS', intentId: created.id, invoiceLink };
  }

  async handlePlategaWebhook(args: {
    transactionId: string;
    callbackStatus: PlategaPaymentStatus;
    callbackAmount: number;
    callbackCurrency: string;
  }) {
    const intent = await (this.prisma as any).paymentIntent.findFirst({
      where: { provider: 'PLATEGA', externalId: String(args.transactionId) },
    });
    if (!intent) {
      // nothing to do (unknown transaction) — acknowledge to stop retries
      return { ok: true, ignored: true };
    }

    if (args.callbackStatus === 'CANCELED') {
      // Не даём "отмене" перетереть финальные состояния
      if (intent.status === 'PAID' || intent.status === 'CHARGEBACK') return { ok: true };

      if (intent.status !== 'CANCELED') {
        await (this.prisma as any).paymentIntent.update({ where: { id: intent.id }, data: { status: 'CANCELED' } });
      }

      // best-effort: если кто-то уже успел создать payment/subscription (ошибка/ручное вмешательство) — откатываем доступ
      const payment = await this.prisma.payment.findUnique({ where: { id: String(args.transactionId) } });
      if (payment && String(payment.status) !== 'PAID' && String(payment.status) !== 'CHARGEBACK') {
        await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'CANCELED' as any } });
        await this.accessRevoker.revokeForPayment({
          vpnUserId: intent.vpnUserId,
          paymentId: payment.id,
          subscriptionAction: 'deactivate',
          noActiveMode: 'end_now',
        });
      }

      return { ok: true };
    }

    if (args.callbackStatus === 'CHARGEBACK') {
      if (intent.status !== 'CHARGEBACK') {
        await (this.prisma as any).paymentIntent.update({ where: { id: intent.id }, data: { status: 'CHARGEBACK' } });
      }
      // Create/update payment as CHARGEBACK (idempotent by transactionId)
      const payment = await this.prisma.payment.upsert({
        where: { id: String(args.transactionId) },
        update: { status: 'CHARGEBACK', paymentIntentId: intent.id },
        create: {
          id: String(args.transactionId),
          vpnUserId: intent.vpnUserId,
          planId: intent.planId,
          paymentIntentId: intent.id,
          amount: intent.amount,
          currency: intent.currency,
          planPriceAtPurchase: intent.amount,
          status: 'CHARGEBACK',
        },
      });

      // Revoke subscription (best-effort)
      await this.accessRevoker.revokeForPayment({
        vpnUserId: intent.vpnUserId,
        paymentId: payment.id,
        subscriptionAction: 'deactivate',
        noActiveMode: 'end_now',
      });
      return { ok: true };
    }

    if (args.callbackStatus !== 'CONFIRMED') {
      return { ok: true, ignored: true };
    }

    // CONFIRMED
    if (intent.status === 'PAID') return { ok: true };

    // amount/currency guard
    if (Number(intent.amount) !== Number(args.callbackAmount) || String(intent.currency) !== String(args.callbackCurrency)) {
      throw new BadRequestException('Amount/currency mismatch');
    }

    // create Payment (idempotent by transactionId)
    const payment = await this.prisma.payment.upsert({
      where: { id: String(args.transactionId) },
      update: { status: 'PAID', paymentIntentId: intent.id },
      create: {
        id: String(args.transactionId),
        vpnUserId: intent.vpnUserId,
        planId: intent.planId,
        paymentIntentId: intent.id,
        amount: intent.amount,
        currency: intent.currency,
        planPriceAtPurchase: intent.amount,
        status: 'PAID',
      },
    });

    await (this.prisma as any).paymentIntent.update({
      where: { id: intent.id },
      data: { status: 'PAID' },
    });

    // subscription idempotent by paymentId unique
    const existingSubscription = await this.prisma.subscription.findUnique({ where: { paymentId: payment.id } });
    if (!existingSubscription) {
      const plan = await this.prisma.plan.findUnique({ where: { id: intent.planId } });
      if (plan) {
        const now = new Date();
        let startsAt = now;
        const activeSubscription = await this.prisma.subscription.findFirst({
          where: { vpnUserId: intent.vpnUserId, active: true },
          orderBy: { endsAt: 'desc' },
        });
        if (activeSubscription && activeSubscription.endsAt > now) startsAt = activeSubscription.endsAt;
        try {
          await this.subscriptions.create({
            vpnUserId: intent.vpnUserId,
            paymentId: payment.id,
            planId: plan.id,
            periodDays: plan.periodDays,
            startsAt: startsAt.toISOString(),
          });
        } catch {
          // ignore unique races
        }
      }
    }

    // firstPaidAt handled by UsersService in subscriptions.create flow; but keep legacy behavior too
    const u = await this.prisma.vpnUser.findUnique({ where: { id: intent.vpnUserId } });
    if (u && !u.firstPaidAt) {
      await this.prisma.vpnUser.update({ where: { id: intent.vpnUserId }, data: { firstPaidAt: payment.createdAt } });
    }

    const telegramId = u?.telegramId ? String(u.telegramId) : undefined;
    return { ok: true, telegramId };
  }

  async handleCryptoCloudPostback(args: { body: CryptoCloudPostbackBody }) {
    const invoiceId = String(args.body?.invoice_id ?? '').trim();
    const orderId = String(args.body?.order_id ?? '').trim();
    const invoiceUuid = String((args.body as any)?.invoice_info?.uuid ?? '').trim();

    // Prefer mapping by our own order_id (we plan to set it to intent.id when creating invoice).
    const intent =
      (orderId
        ? await (this.prisma as any).paymentIntent.findUnique({ where: { id: orderId } })
        : null) ??
      (invoiceId
        ? await (this.prisma as any).paymentIntent.findFirst({ where: { externalId: invoiceId } })
        : null) ??
      (invoiceUuid
        ? await (this.prisma as any).paymentIntent.findFirst({ where: { externalId: invoiceUuid } })
        : null);

    if (!intent) {
      // unknown invoice — acknowledge to stop retries
      return { ok: true, ignored: true as const };
    }
    if (String(intent.provider) !== 'CRYPTOCLOUD') {
      return { ok: true, ignored: true as const };
    }

    // POSTBACK is sent after successful payment. Still, be defensive.
    const status = String(args.body?.status ?? '').toLowerCase();
    if (status && status !== 'success') {
      return { ok: true, ignored: true as const };
    }

    if (intent.status === 'PAID') return { ok: true };

    // idempotent paymentId: prefer UUID if present, else invoice_id, else intent.id
    const paymentId = invoiceUuid || invoiceId || intent.id;

    const payment = await this.prisma.payment.upsert({
      where: { id: String(paymentId) },
      update: { status: 'PAID', paymentIntentId: intent.id },
      create: {
        id: String(paymentId),
        vpnUserId: intent.vpnUserId,
        planId: intent.planId,
        paymentIntentId: intent.id,
        amount: intent.amount,
        currency: intent.currency,
        planPriceAtPurchase: intent.amount,
        status: 'PAID',
      },
    });

    await (this.prisma as any).paymentIntent.update({
      where: { id: intent.id },
      data: { status: 'PAID', externalId: invoiceId || invoiceUuid || intent.externalId || null },
    });

    // subscription idempotent by paymentId unique
    const existingSubscription = await this.prisma.subscription.findUnique({ where: { paymentId: payment.id } });
    if (!existingSubscription) {
      const plan = await this.prisma.plan.findUnique({ where: { id: intent.planId } });
      if (plan) {
        const now = new Date();
        let startsAt = now;
        const activeSubscription = await this.prisma.subscription.findFirst({
          where: { vpnUserId: intent.vpnUserId, active: true },
          orderBy: { endsAt: 'desc' },
        });
        if (activeSubscription && activeSubscription.endsAt > now) startsAt = activeSubscription.endsAt;
        try {
          await this.subscriptions.create({
            vpnUserId: intent.vpnUserId,
            paymentId: payment.id,
            planId: plan.id,
            periodDays: plan.periodDays,
            startsAt: startsAt.toISOString(),
          });
        } catch {
          // ignore unique races
        }
      }
    }

    const u = await this.prisma.vpnUser.findUnique({ where: { id: intent.vpnUserId } });
    if (u && !u.firstPaidAt) {
      await this.prisma.vpnUser.update({ where: { id: intent.vpnUserId }, data: { firstPaidAt: payment.createdAt } });
    }
    const telegramId = u?.telegramId ? String(u.telegramId) : undefined;
    return { ok: true, telegramId };
  }

  async handleTelegramStarsSuccessfulPayment(args: {
    botToken: string;
    telegramPaymentChargeId: string;
    payload: string;
    amount: number;
    currency: string;
  }) {
    const secret = this.config.get<string>('PAYMENTS_PAYLOAD_SECRET') || args.botToken;
    const data = verifyTelegramStarsInvoicePayload({ payload: args.payload, secret });
    if (!data) throw new BadRequestException('Invalid stars payload');

    const intent = await (this.prisma as any).paymentIntent.findUnique({ where: { id: data.intentId } });
    if (!intent) throw new NotFoundException('Payment intent not found');
    if (intent.status === 'PAID') return { ok: true };

    if (intent.provider !== 'TELEGRAM_STARS') throw new BadRequestException('Intent provider mismatch');
    if (Number(intent.amount) !== Number(args.amount) || String(intent.currency) !== String(args.currency)) {
      throw new BadRequestException('Amount/currency mismatch');
    }

    const payment = await this.prisma.payment.upsert({
      where: { id: args.telegramPaymentChargeId },
      update: { status: 'PAID', paymentIntentId: intent.id },
      create: {
        id: args.telegramPaymentChargeId,
        vpnUserId: intent.vpnUserId,
        planId: intent.planId,
        paymentIntentId: intent.id,
        amount: intent.amount,
        currency: intent.currency,
        planPriceAtPurchase: intent.amount,
        status: 'PAID',
      },
    });

    await (this.prisma as any).paymentIntent.update({ where: { id: intent.id }, data: { status: 'PAID', externalId: args.telegramPaymentChargeId } });

    const existingSubscription = await this.prisma.subscription.findUnique({ where: { paymentId: payment.id } });
    if (!existingSubscription) {
      const plan = await this.prisma.plan.findUnique({ where: { id: intent.planId } });
      if (plan) {
        const now = new Date();
        let startsAt = now;
        const activeSubscription = await this.prisma.subscription.findFirst({
          where: { vpnUserId: intent.vpnUserId, active: true },
          orderBy: { endsAt: 'desc' },
        });
        if (activeSubscription && activeSubscription.endsAt > now) startsAt = activeSubscription.endsAt;
        try {
          await this.subscriptions.create({
            vpnUserId: intent.vpnUserId,
            paymentId: payment.id,
            planId: plan.id,
            periodDays: plan.periodDays,
            startsAt: startsAt.toISOString(),
          });
        } catch {
          // ignore
        }
      }
    }

    const u = await this.prisma.vpnUser.findUnique({ where: { id: intent.vpnUserId } });
    if (u && !u.firstPaidAt) {
      await this.prisma.vpnUser.update({ where: { id: intent.vpnUserId }, data: { firstPaidAt: payment.createdAt } });
    }

    return { ok: true };
  }

}

