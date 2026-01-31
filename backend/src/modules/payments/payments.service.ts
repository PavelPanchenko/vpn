import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
    private readonly users: UsersService,
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
      plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
      if (!plan) throw new NotFoundException('Plan not found');
      if (!plan.active) throw new BadRequestException('Plan is not active');
      if (plan.isTrial) throw new BadRequestException('Cannot pay for trial plan');
      
      // Сохраняем текущую цену тарифа на момент покупки
      planPriceAtPurchase = plan.price;
      
      // Проверяем валюту (цена может отличаться для старых клиентов)
      if (dto.currency !== plan.currency) {
        throw new BadRequestException(`Currency must be ${plan.currency} for this plan`);
      }
      
      // Предупреждение, если сумма отличается от текущей цены (но не блокируем)
      // Это позволяет применять старые цены для существующих клиентов
      if (dto.amount !== plan.price) {
        // Логируем, но не блокируем - это может быть старая цена для существующего клиента
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
        status: dto.status,
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
    amount: number;
    currency: string; // ожидаем XTR
  }) {
    const user = await this.prisma.vpnUser.findUnique({ where: { id: args.vpnUserId } });
    if (!user) throw new NotFoundException('User not found');

    const plan = await this.prisma.plan.findUnique({ where: { id: args.planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    if (!plan.active) throw new BadRequestException('Plan is not active');
    if (plan.isTrial) throw new BadRequestException('Cannot pay for trial plan');

    if (args.currency !== plan.currency) {
      throw new BadRequestException(`Currency must be ${plan.currency} for this plan`);
    }
    if (args.amount !== plan.price) {
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
        planPriceAtPurchase: plan.price,
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
        status: dto.status,
      },
      include: { vpnUser: { include: { server: true } } },
    });
  }

  async remove(id: string) {
    const payment = await this.get(id);

    // Если платеж был успешным (PAID), ищем связанную подписку по прямой связи paymentId
    if (payment.status === 'PAID') {
      const relatedSubscription = await this.prisma.subscription.findUnique({
        where: { paymentId: id },
      });

      if (relatedSubscription) {
        // Удаляем подписку
        await this.prisma.subscription.delete({ where: { id: relatedSubscription.id } });

        // Пересчитываем expiresAt пользователя на основе оставшихся активных подписок
        const remainingActiveSubscription = await this.prisma.subscription.findFirst({
          where: { vpnUserId: payment.vpnUserId, active: true },
          orderBy: { endsAt: 'desc' },
        });

        const user = await this.prisma.vpnUser.findUnique({ where: { id: payment.vpnUserId } });
        if (user) {
          const now = new Date();
          let nextExpiresAt: Date | null = null;
          let nextStatus: 'NEW' | 'ACTIVE' | 'BLOCKED' | 'EXPIRED' = 'EXPIRED';

          if (remainingActiveSubscription) {
            nextExpiresAt = remainingActiveSubscription.endsAt;
            nextStatus =
              user.status === 'BLOCKED'
                ? 'BLOCKED'
                : nextExpiresAt && nextExpiresAt.getTime() < now.getTime()
                  ? 'EXPIRED'
                  : 'ACTIVE';
          } else {
            const allSubscriptions = await this.prisma.subscription.findMany({
              where: { vpnUserId: payment.vpnUserId },
              orderBy: { endsAt: 'desc' },
              take: 1,
            });
            if (allSubscriptions.length > 0) {
              nextExpiresAt = allSubscriptions[0].endsAt;
              nextStatus =
                user.status === 'BLOCKED'
                  ? 'BLOCKED'
                  : nextExpiresAt && nextExpiresAt.getTime() < now.getTime()
                    ? 'EXPIRED'
                    : 'ACTIVE';
            } else {
              nextExpiresAt = null;
              nextStatus = user.status === 'BLOCKED' ? 'BLOCKED' : 'EXPIRED';
            }
          }

          // Обновляем пользователя через UsersService для синхронизации с панелью
          await this.users.update(payment.vpnUserId, {
            expiresAt: nextExpiresAt ? nextExpiresAt.toISOString() : undefined,
            status: nextStatus,
          });
        }
      }
    }

    await this.prisma.payment.delete({ where: { id } });
    return { ok: true };
  }
}

