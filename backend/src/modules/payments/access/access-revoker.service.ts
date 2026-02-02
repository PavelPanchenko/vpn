import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../../users/users.service';

type SubscriptionAction = 'deactivate' | 'delete';
type NoActiveMode = 'end_now' | 'use_last_any';

@Injectable()
export class AccessRevokerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  async revokeForPayment(args: {
    vpnUserId: string;
    paymentId: string;
    subscriptionAction: SubscriptionAction;
    noActiveMode: NoActiveMode;
  }) {
    const sub = await this.prisma.subscription.findUnique({ where: { paymentId: args.paymentId } });
    if (sub) {
      if (args.subscriptionAction === 'delete') {
        await this.prisma.subscription.delete({ where: { id: sub.id } });
      } else {
        if (sub.active) {
          await this.prisma.subscription.update({ where: { id: sub.id }, data: { active: false } });
        }
      }
    }

    await this.recalculateAndSyncUserAccess({ vpnUserId: args.vpnUserId, noActiveMode: args.noActiveMode });
  }

  async recalculateAndSyncUserAccess(args: { vpnUserId: string; noActiveMode: NoActiveMode }) {
    const user = await this.prisma.vpnUser.findUnique({ where: { id: args.vpnUserId }, select: { status: true } });
    if (!user) return;

    const now = new Date();

    const remainingActive = await this.prisma.subscription.findFirst({
      where: { vpnUserId: args.vpnUserId, active: true },
      orderBy: { endsAt: 'desc' },
      select: { endsAt: true },
    });

    let nextExpiresAt: Date | null;
    if (remainingActive) {
      nextExpiresAt = remainingActive.endsAt;
    } else if (args.noActiveMode === 'end_now') {
      nextExpiresAt = now;
    } else {
      const lastAny = await this.prisma.subscription.findFirst({
        where: { vpnUserId: args.vpnUserId },
        orderBy: { endsAt: 'desc' },
        select: { endsAt: true },
      });
      nextExpiresAt = lastAny?.endsAt ?? null;
    }

    const nextStatus: 'NEW' | 'ACTIVE' | 'BLOCKED' | 'EXPIRED' =
      user.status === 'BLOCKED'
        ? 'BLOCKED'
        : nextExpiresAt && nextExpiresAt.getTime() > now.getTime()
          ? 'ACTIVE'
          : 'EXPIRED';

    await this.users.update(args.vpnUserId, {
      expiresAt: nextExpiresAt ? nextExpiresAt.toISOString() : null,
      status: nextStatus,
    });
  }
}

