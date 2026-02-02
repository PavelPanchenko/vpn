import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UsersService } from '../users/users.service';
import { AccessRevokerService } from './access/access-revoker.service';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
    private readonly users: UsersService,
    private readonly accessRevoker: AccessRevokerService,
  ) {}

  list() {
    return this.prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        vpnUser: { include: { server: true, userServers: { include: { server: true } } } },
        plan: true,
      },
    });
  }

  async get(id: string) {
    const p = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        vpnUser: { include: { server: true, userServers: { include: { server: true } } } },
        plan: true,
      },
    });
    if (!p) throw new NotFoundException('Payment not found');
    return p;
  }

  async create(dto: CreatePaymentDto) {
    const user = await this.prisma.vpnUser.findUnique({ where: { id: dto.vpnUserId } });
    if (!user) throw new NotFoundException('User not found');

    let plan = null;
    let planPriceAtPurchase: number | null = null;
    if (dto.planId) {
      plan = await (this.prisma as any).plan.findUnique({
        where: { id: dto.planId },
        include: { variants: { where: { active: true } } },
      });
      if (!plan) throw new NotFoundException('Plan not found');
      if (!plan.active) throw new BadRequestException('Plan is not active');
      if (plan.isTrial) throw new BadRequestException('Cannot pay for trial plan');

      const variant = (plan as any).variants?.find((v: any) => v.currency === dto.currency) ?? null;
      if (!variant) {
        throw new BadRequestException(`Plan does not support currency ${dto.currency}`);
      }

      // Сохраняем текущую цену варианта на момент покупки
      planPriceAtPurchase = Number(variant.price);

      // Предупреждение, если сумма отличается от текущей цены (но не блокируем)
      // Это позволяет применять старые цены для существующих клиентов
      if (dto.amount !== planPriceAtPurchase) {
        // best-effort: можно логировать, но не блокируем
      }
    }

    // Сначала создаем платеж
    const createdPayment = await this.prisma.payment.create({
      data: {
        vpnUserId: dto.vpnUserId,
        planId: dto.planId ?? null,
        amount: dto.amount,
        currency: dto.currency,
        planPriceAtPurchase: planPriceAtPurchase,
        status: dto.status as any,
      },
    });

    // Если платеж успешный - устанавливаем firstPaidAt (только один раз, при первом платеже)
    if (dto.status === 'PAID') {
      const user = await this.prisma.vpnUser.findUnique({ where: { id: dto.vpnUserId } });
      if (user && !user.firstPaidAt) {
        await this.prisma.vpnUser.update({
          where: { id: dto.vpnUserId },
          data: { firstPaidAt: createdPayment.createdAt },
        });
      }
    }

    // Если платеж успешный и указан тариф, создаем подписку
    if (dto.status === 'PAID' && plan) {
      const now = new Date();
      // Определяем начальную дату: если у пользователя есть активная подписка и она еще не истекла,
      // продлеваем от даты окончания, иначе от текущей даты
      let startsAt = now;
      const activeSubscription = await this.prisma.subscription.findFirst({
        where: { vpnUserId: dto.vpnUserId, active: true },
        orderBy: { endsAt: 'desc' },
      });

      if (activeSubscription && activeSubscription.endsAt > now) {
        // Продлеваем от даты окончания текущей подписки
        startsAt = activeSubscription.endsAt;
      }

      // Создаем подписку через SubscriptionsService с paymentId
      await this.subscriptions.create({
        vpnUserId: dto.vpnUserId,
        paymentId: createdPayment.id,
        planId: plan.id,
        periodDays: plan.periodDays,
        startsAt: startsAt.toISOString(),
      });
    }

    return this.prisma.payment.findUnique({
      where: { id: createdPayment.id },
      include: {
        vpnUser: { include: { server: true, userServers: { include: { server: true } } } },
        plan: true,
      },
    });
  }

  /**
   * Идемпотентное подтверждение оплаты Telegram Stars по telegram_payment_charge_id.
   * Важно: мы НЕ создаём payment до успешной оплаты (у нас нет статуса PENDING в БД),
   * поэтому создаём запись только после successful_payment.
   */
  async createPaidFromTelegramStars(args: {
    telegramPaymentChargeId: string;
    vpnUserId: string;
    planId: string;
    variantId: string;
    amount: number;
    currency: string; // ожидаем XTR
  }) {
    const user = await this.prisma.vpnUser.findUnique({ where: { id: args.vpnUserId } });
    if (!user) throw new NotFoundException('User not found');

    const plan = await this.prisma.plan.findUnique({ where: { id: args.planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    if (!plan.active) throw new BadRequestException('Plan is not active');
    if (plan.isTrial) throw new BadRequestException('Cannot pay for trial plan');

    const variant = await (this.prisma as any).planVariant.findUnique({ where: { id: args.variantId } });
    if (!variant || !variant.active || variant.planId !== plan.id) {
      throw new BadRequestException('Plan variant is not available');
    }

    if (args.currency !== variant.currency) {
      throw new BadRequestException(`Currency must be ${variant.currency} for this plan variant`);
    }
    if (args.amount !== variant.price) {
      throw new BadRequestException('Payment amount mismatch');
    }

    // 1) payment (idempotent by charge id)
    const payment = await this.prisma.payment.upsert({
      where: { id: args.telegramPaymentChargeId },
      update: {
        // если уже есть — не меняем сумму/валюту, только гарантируем статус
        status: 'PAID',
      },
      create: {
        id: args.telegramPaymentChargeId,
        vpnUserId: args.vpnUserId,
        planId: plan.id,
        amount: args.amount,
        currency: args.currency,
        planPriceAtPurchase: variant.price,
        status: 'PAID',
      },
      include: {
        vpnUser: { include: { server: true, userServers: { include: { server: true } } } },
        plan: true,
      },
    });

    // 2) firstPaidAt (один раз)
    if (!user.firstPaidAt) {
      await this.prisma.vpnUser.update({
        where: { id: args.vpnUserId },
        data: { firstPaidAt: payment.createdAt },
      });
    }

    // 3) subscription (idempotent by unique paymentId)
    const existingSubscription = await this.prisma.subscription.findUnique({
      where: { paymentId: payment.id },
    });
    if (!existingSubscription) {
      const now = new Date();
      let startsAt = now;
      const activeSubscription = await this.prisma.subscription.findFirst({
        where: { vpnUserId: args.vpnUserId, active: true },
        orderBy: { endsAt: 'desc' },
      });
      if (activeSubscription && activeSubscription.endsAt > now) {
        startsAt = activeSubscription.endsAt;
      }

      try {
        await this.subscriptions.create({
          vpnUserId: args.vpnUserId,
          paymentId: payment.id,
          planId: plan.id,
          periodDays: plan.periodDays,
          startsAt: startsAt.toISOString(),
        });
      } catch {
        // возможен race при дублирующемся update (уникальный paymentId) — игнорируем
      }
    }

    return payment;
  }

  async update(id: string, dto: UpdatePaymentDto) {
    await this.get(id);
    return this.prisma.payment.update({
      where: { id },
      data: {
        vpnUserId: dto.vpnUserId,
        amount: dto.amount,
        currency: dto.currency,
        status: dto.status as any,
      },
      include: { vpnUser: { include: { server: true } } },
    });
  }

  async remove(id: string) {
    const payment = await this.get(id);

    // Подписка создаётся только для успешных оплат; при CHARGEBACK она могла уже быть создана ранее
    if (String(payment.status) === 'PAID' || String(payment.status) === 'CHARGEBACK') {
      await this.accessRevoker.revokeForPayment({
        vpnUserId: payment.vpnUserId,
        paymentId: id,
        subscriptionAction: 'delete',
        noActiveMode: 'use_last_any',
      });
    }

    await this.prisma.payment.delete({ where: { id } });
    return { ok: true };
  }
}

