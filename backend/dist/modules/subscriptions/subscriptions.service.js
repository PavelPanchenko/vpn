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
exports.SubscriptionsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const users_service_1 = require("../users/users.service");
function addDays(date, days) {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
}
let SubscriptionsService = class SubscriptionsService {
    prisma;
    users;
    constructor(prisma, users) {
        this.prisma = prisma;
        this.users = users;
    }
    async refreshExpiredUsers() {
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
    async get(id) {
        await this.refreshExpiredUsers();
        const sub = await this.prisma.subscription.findUnique({
            where: { id },
            include: { vpnUser: { include: { server: true } } },
        });
        if (!sub)
            throw new common_1.NotFoundException('Subscription not found');
        return sub;
    }
    async create(dto) {
        const user = await this.prisma.vpnUser.findUnique({ where: { id: dto.vpnUserId } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
        let periodDays = dto.periodDays;
        if (!periodDays && dto.planId) {
            const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
            if (!plan)
                throw new common_1.NotFoundException('Plan not found');
            periodDays = plan.periodDays;
        }
        if (!periodDays) {
            throw new common_1.NotFoundException('Either periodDays or planId must be provided');
        }
        const endsAt = addDays(startsAt, periodDays);
        const now = new Date();
        const nextStatus = user.status === 'BLOCKED'
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
        await this.users.update(dto.vpnUserId, {
            expiresAt: endsAt.toISOString(),
            status: nextStatus,
        });
        return created;
    }
    async update(id, dto) {
        const existing = await this.prisma.subscription.findUnique({ where: { id } });
        if (!existing)
            throw new common_1.NotFoundException('Subscription not found');
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
        if (active) {
            const user = await this.prisma.vpnUser.findUnique({ where: { id: existing.vpnUserId } });
            if (user) {
                const now = new Date();
                const nextStatus = user.status === 'BLOCKED'
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
    async remove(id) {
        await this.get(id);
        await this.prisma.subscription.delete({ where: { id } });
        return { ok: true };
    }
};
exports.SubscriptionsService = SubscriptionsService;
exports.SubscriptionsService = SubscriptionsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        users_service_1.UsersService])
], SubscriptionsService);
//# sourceMappingURL=subscriptions.service.js.map