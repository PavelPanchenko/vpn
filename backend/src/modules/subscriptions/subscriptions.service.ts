import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { UsersService } from '../users/users.service';

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  private async refreshExpiredUsers() {
    const now = new Date();
    await this.prisma.vpnUser.updateMany({
      where: { status: 'ACTIVE', expiresAt: { not: null, lt: now } },
      data: { status: 'EXPIRED' },
    });
  }

  async list() {
    await this.refreshExpiredUsers();
    return this.prisma.subscription.findMany({
      orderBy: { endsAt: 'desc' },
      include: { vpnUser: { include: { server: true } } },
    });
  }

  async get(id: string) {
    await this.refreshExpiredUsers();
    const sub = await this.prisma.subscription.findUnique({
      where: { id },
      include: { vpnUser: { include: { server: true } } },
    });
    if (!sub) throw new NotFoundException('Subscription not found');
    return sub;
  }

  async create(dto: CreateSubscriptionDto) {
    const user = await this.prisma.vpnUser.findUnique({ where: { id: dto.vpnUserId } });
    if (!user) throw new NotFoundException('User not found');

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();

    let periodDays = dto.periodDays;
    if (!periodDays && dto.planId) {
      const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
      if (!plan) throw new NotFoundException('Plan not found');
      periodDays = plan.periodDays;
    }
    if (!periodDays) {
      throw new NotFoundException('Either periodDays or planId must be provided');
    }

    const endsAt = addDays(startsAt, periodDays);

    const now = new Date();
    const nextStatus: 'ACTIVE' | 'BLOCKED' | 'EXPIRED' =
      user.status === 'BLOCKED'
        ? 'BLOCKED'
        : endsAt.getTime() < now.getTime()
          ? 'EXPIRED'
          : 'ACTIVE';

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.subscription.updateMany({
        where: { vpnUserId: dto.vpnUserId, active: true },
        data: { active: false },
      });

      const created = await tx.subscription.create({
        data: {
          vpnUserId: dto.vpnUserId,
          paymentId: dto.paymentId ?? null,
          periodDays,
          startsAt,
          endsAt,
          active: true,
        },
      });
      return created;
    });

    // После успешного создания подписки — обновляем пользователя и панель через UsersService,
    // чтобы не дублировать логику и держать DRY.
    await this.users.update(dto.vpnUserId, {
      expiresAt: endsAt.toISOString(),
      status: nextStatus,
    });

    return created;
  }

  async update(id: string, dto: UpdateSubscriptionDto) {
    const existing = await this.prisma.subscription.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Subscription not found');

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    const endsAt = dto.endsAt
      ? new Date(dto.endsAt)
      : dto.periodDays
        ? addDays(startsAt, dto.periodDays)
        : existing.endsAt;
    const periodDays = dto.periodDays ?? existing.periodDays;
    const active = dto.active ?? existing.active;

    const updated = await this.prisma.subscription.update({
      where: { id },
      data: { startsAt, endsAt, periodDays, active },
    });

    // Если это активная подписка — синхронизируем expiresAt/статус пользователя через UsersService.
    if (active) {
      const user = await this.prisma.vpnUser.findUnique({ where: { id: existing.vpnUserId } });
      if (user) {
        const now = new Date();
        const nextStatus: 'ACTIVE' | 'BLOCKED' | 'EXPIRED' =
          user.status === 'BLOCKED'
            ? 'BLOCKED'
            : endsAt.getTime() < now.getTime()
              ? 'EXPIRED'
              : 'ACTIVE';

        await this.users.update(existing.vpnUserId, {
          expiresAt: endsAt.toISOString(),
          status: nextStatus,
        });
      }
    }

    return updated;
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.subscription.delete({ where: { id } });
    return { ok: true };
  }
}

