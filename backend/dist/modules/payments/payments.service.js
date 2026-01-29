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
exports.PaymentsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const subscriptions_service_1 = require("../subscriptions/subscriptions.service");
const users_service_1 = require("../users/users.service");
function addDays(date, days) {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
}
let PaymentsService = class PaymentsService {
    prisma;
    subscriptions;
    users;
    constructor(prisma, subscriptions, users) {
        this.prisma = prisma;
        this.subscriptions = subscriptions;
        this.users = users;
    }
    list() {
        return this.prisma.payment.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                vpnUser: { include: { server: true, userServers: { include: { server: true } } } },
                plan: true,
            },
        });
    }
    async get(id) {
        const p = await this.prisma.payment.findUnique({
            where: { id },
            include: {
                vpnUser: { include: { server: true, userServers: { include: { server: true } } } },
                plan: true,
            },
        });
        if (!p)
            throw new common_1.NotFoundException('Payment not found');
        return p;
    }
    async create(dto) {
        const user = await this.prisma.vpnUser.findUnique({ where: { id: dto.vpnUserId } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        let plan = null;
        let planPriceAtPurchase = null;
        if (dto.planId) {
            plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
            if (!plan)
                throw new common_1.NotFoundException('Plan not found');
            if (!plan.active)
                throw new common_1.BadRequestException('Plan is not active');
            if (plan.isTrial)
                throw new common_1.BadRequestException('Cannot pay for trial plan');
            planPriceAtPurchase = plan.price;
            if (dto.currency !== plan.currency) {
                throw new common_1.BadRequestException(`Currency must be ${plan.currency} for this plan`);
            }
            if (dto.amount !== plan.price) {
            }
        }
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
        if (dto.status === 'PAID') {
            const user = await this.prisma.vpnUser.findUnique({ where: { id: dto.vpnUserId } });
            if (user && !user.firstPaidAt) {
                await this.prisma.vpnUser.update({
                    where: { id: dto.vpnUserId },
                    data: { firstPaidAt: createdPayment.createdAt },
                });
            }
        }
        if (dto.status === 'PAID' && plan) {
            const now = new Date();
            let startsAt = now;
            const activeSubscription = await this.prisma.subscription.findFirst({
                where: { vpnUserId: dto.vpnUserId, active: true },
                orderBy: { endsAt: 'desc' },
            });
            if (activeSubscription && activeSubscription.endsAt > now) {
                startsAt = activeSubscription.endsAt;
            }
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
        return this.prisma.payment.create({
            data: {
                vpnUserId: dto.vpnUserId,
                planId: dto.planId ?? null,
                amount: dto.amount,
                currency: dto.currency,
                status: dto.status,
            },
            include: {
                vpnUser: { include: { server: true, userServers: { include: { server: true } } } },
                plan: true,
            },
        });
    }
    async update(id, dto) {
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
    async remove(id) {
        const payment = await this.get(id);
        if (payment.status === 'PAID') {
            const relatedSubscription = await this.prisma.subscription.findUnique({
                where: { paymentId: id },
            });
            if (relatedSubscription) {
                await this.prisma.subscription.delete({ where: { id: relatedSubscription.id } });
                const remainingActiveSubscription = await this.prisma.subscription.findFirst({
                    where: { vpnUserId: payment.vpnUserId, active: true },
                    orderBy: { endsAt: 'desc' },
                });
                const user = await this.prisma.vpnUser.findUnique({ where: { id: payment.vpnUserId } });
                if (user) {
                    const now = new Date();
                    let nextExpiresAt = null;
                    let nextStatus = 'EXPIRED';
                    if (remainingActiveSubscription) {
                        nextExpiresAt = remainingActiveSubscription.endsAt;
                        nextStatus =
                            user.status === 'BLOCKED'
                                ? 'BLOCKED'
                                : nextExpiresAt && nextExpiresAt.getTime() < now.getTime()
                                    ? 'EXPIRED'
                                    : 'ACTIVE';
                    }
                    else {
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
                        }
                        else {
                            nextExpiresAt = null;
                            nextStatus = user.status === 'BLOCKED' ? 'BLOCKED' : 'EXPIRED';
                        }
                    }
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
};
exports.PaymentsService = PaymentsService;
exports.PaymentsService = PaymentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        subscriptions_service_1.SubscriptionsService,
        users_service_1.UsersService])
], PaymentsService);
//# sourceMappingURL=payments.service.js.map