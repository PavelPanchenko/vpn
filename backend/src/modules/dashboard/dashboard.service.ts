import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type ChartPoint = { date: string; count: number };

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const toCurrencySums = (rows: Array<{ currency: string; _sum: { amount: number | null } }>) => {
      const out: Record<string, number> = {};
      for (const r of rows) {
        const v = Number(r._sum?.amount ?? 0);
        out[String(r.currency)] = Number.isFinite(v) ? v : 0;
      }
      return out;
    };

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(todayStart);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29); // 30 дней включая сегодня

    // Статистика серверов
    const [totalServers, activeServers] = await Promise.all([
      this.prisma.vpnServer.count(),
      this.prisma.vpnServer.count({ where: { active: true } }),
    ]);

    // Статистика пользователей
    const [totalUsers, activeUsers, blockedUsers, expiredUsers, todayUsers, weekUsers, monthUsers] = await Promise.all([
      this.prisma.vpnUser.count(),
      this.prisma.vpnUser.count({ where: { status: 'ACTIVE' } }),
      this.prisma.vpnUser.count({ where: { status: 'BLOCKED' } }),
      this.prisma.vpnUser.count({ where: { status: 'EXPIRED' } }),
      this.prisma.vpnUser.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.vpnUser.count({ where: { createdAt: { gte: weekStart } } }),
      this.prisma.vpnUser.count({ where: { createdAt: { gte: monthStart } } }),
    ]);

    // Статистика подписок
    const activeSubscriptions = await this.prisma.subscription.count({
      where: { active: true },
    });

    // Статистика платежей
    const [
      totalPayments,
      todayPayments,
      weekPayments,
      monthPayments,
      totalRevenueByCurrency,
      todayRevenueByCurrency,
      weekRevenueByCurrency,
      monthRevenueByCurrency,
    ] = await Promise.all([
      this.prisma.payment.count({ where: { status: 'PAID' } }),
      this.prisma.payment.count({
        where: { status: 'PAID', createdAt: { gte: todayStart } },
      }),
      this.prisma.payment.count({
        where: { status: 'PAID', createdAt: { gte: weekStart } },
      }),
      this.prisma.payment.count({
        where: { status: 'PAID', createdAt: { gte: monthStart } },
      }),
      this.prisma.payment.groupBy({
        by: ['currency'],
        where: { status: 'PAID' },
        _sum: { amount: true },
      }),
      this.prisma.payment.groupBy({
        by: ['currency'],
        where: { status: 'PAID', createdAt: { gte: todayStart } },
        _sum: { amount: true },
      }),
      this.prisma.payment.groupBy({
        by: ['currency'],
        where: { status: 'PAID', createdAt: { gte: weekStart } },
        _sum: { amount: true },
      }),
      this.prisma.payment.groupBy({
        by: ['currency'],
        where: { status: 'PAID', createdAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
    ]);

    // Графики: пользователи и платежи по дням (30 дней)
    const [usersChartRaw, paymentsChartRaw] = await Promise.all([
      this.prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
        SELECT DATE("createdAt") as date, COUNT(*) as count
        FROM "vpn_users"
        WHERE "createdAt" >= ${thirtyDaysAgo}
        GROUP BY DATE("createdAt")
        ORDER BY date
      `,
      this.prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
        SELECT DATE("createdAt") as date, COUNT(*) as count
        FROM "payments"
        WHERE status = 'PAID' AND "createdAt" >= ${thirtyDaysAgo}
        GROUP BY DATE("createdAt")
        ORDER BY date
      `,
    ]);

    const usersChart = this.fillChartGaps(usersChartRaw, thirtyDaysAgo, todayStart);
    const paymentsChart = this.fillChartGaps(paymentsChartRaw, thirtyDaysAgo, todayStart);

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
        today: todayUsers,
        week: weekUsers,
        month: monthUsers,
      },
      subscriptions: {
        active: activeSubscriptions,
      },
      payments: {
        total: totalPayments,
        today: todayPayments,
        week: weekPayments,
        month: monthPayments,
      },
      revenue: {
        total: toCurrencySums(totalRevenueByCurrency),
        today: toCurrencySums(todayRevenueByCurrency),
        week: toCurrencySums(weekRevenueByCurrency),
        month: toCurrencySums(monthRevenueByCurrency),
      },
      charts: {
        users: usersChart,
        payments: paymentsChart,
      },
      recent: {
        payments: recentPayments,
        users: recentUsers,
      },
    };
  }

  /** Заполняет пропущенные дни нулями для непрерывного графика. */
  private fillChartGaps(
    raw: Array<{ date: Date; count: bigint }>,
    from: Date,
    to: Date,
  ): ChartPoint[] {
    const map = new Map<string, number>();
    for (const r of raw) {
      const key = new Date(r.date).toISOString().slice(0, 10);
      map.set(key, Number(r.count));
    }

    const result: ChartPoint[] = [];
    const cursor = new Date(from);
    while (cursor <= to) {
      const key = cursor.toISOString().slice(0, 10);
      result.push({ date: key, count: map.get(key) ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }
}
