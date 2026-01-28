import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Статистика серверов
    const [totalServers, activeServers] = await Promise.all([
      this.prisma.vpnServer.count(),
      this.prisma.vpnServer.count({ where: { active: true } }),
    ]);

    // Статистика пользователей
    const [totalUsers, activeUsers, blockedUsers, expiredUsers] = await Promise.all([
      this.prisma.vpnUser.count(),
      this.prisma.vpnUser.count({ where: { status: 'ACTIVE' } }),
      this.prisma.vpnUser.count({ where: { status: 'BLOCKED' } }),
      this.prisma.vpnUser.count({ where: { status: 'EXPIRED' } }),
    ]);

    // Статистика подписок
    const activeSubscriptions = await this.prisma.subscription.count({
      where: { active: true },
    });

    // Статистика платежей
    const [totalPayments, todayPayments, monthPayments, totalRevenue, todayRevenue, monthRevenue] = await Promise.all([
      this.prisma.payment.count({ where: { status: 'PAID' } }),
      this.prisma.payment.count({
        where: { status: 'PAID', createdAt: { gte: todayStart } },
      }),
      this.prisma.payment.count({
        where: { status: 'PAID', createdAt: { gte: monthStart } },
      }),
      this.prisma.payment.aggregate({
        where: { status: 'PAID' },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { status: 'PAID', createdAt: { gte: todayStart } },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { status: 'PAID', createdAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
    ]);

    // Недавние платежи
    const recentPayments = await this.prisma.payment.findMany({
      where: { status: 'PAID' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        vpnUser: { select: { name: true, uuid: true } },
        plan: { select: { name: true } },
      },
    });

    // Недавние пользователи
    const recentUsers = await this.prisma.vpnUser.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        name: true,
        uuid: true,
        status: true,
        createdAt: true,
      },
    });

    return {
      servers: {
        total: totalServers,
        active: activeServers,
      },
      users: {
        total: totalUsers,
        active: activeUsers,
        blocked: blockedUsers,
        expired: expiredUsers,
      },
      subscriptions: {
        active: activeSubscriptions,
      },
      payments: {
        total: totalPayments,
        today: todayPayments,
        month: monthPayments,
      },
      revenue: {
        total: totalRevenue._sum.amount ?? 0,
        today: todayRevenue._sum.amount ?? 0,
        month: monthRevenue._sum.amount ?? 0,
      },
      recent: {
        payments: recentPayments,
        users: recentUsers,
      },
    };
  }
}
