"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let DashboardService = class DashboardService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getStats() {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const [totalServers, activeServers] = await Promise.all([
            this.prisma.vpnServer.count(),
            this.prisma.vpnServer.count({ where: { active: true } }),
        ]);
        const [totalUsers, activeUsers, blockedUsers, expiredUsers] = await Promise.all([
            this.prisma.vpnUser.count(),
            this.prisma.vpnUser.count({ where: { status: 'ACTIVE' } }),
            this.prisma.vpnUser.count({ where: { status: 'BLOCKED' } }),
            this.prisma.vpnUser.count({ where: { status: 'EXPIRED' } }),
        ]);
        const activeSubscriptions = await this.prisma.subscription.count({
            where: { active: true },
        });
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
        const recentPayments = await this.prisma.payment.findMany({
            where: { status: 'PAID' },
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: {
                vpnUser: { select: { name: true, uuid: true } },
                plan: { select: { name: true } },
            },
        });
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
};
exports.DashboardService = DashboardService;
exports.DashboardService = DashboardService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DashboardService);
//# sourceMappingURL=dashboard.service.js.map