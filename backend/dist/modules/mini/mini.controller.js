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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MiniController = void 0;
const common_1 = require("@nestjs/common");
const mini_auth_dto_1 = require("./dto/mini-auth.dto");
const mini_pay_dto_1 = require("./dto/mini-pay.dto");
const prisma_service_1 = require("../prisma/prisma.service");
const users_service_1 = require("../users/users.service");
const plans_service_1 = require("../plans/plans.service");
const payments_service_1 = require("../payments/payments.service");
const bot_service_1 = require("../bot/bot.service");
const crypto = require("crypto");
let MiniController = class MiniController {
    prisma;
    usersService;
    plansService;
    paymentsService;
    botService;
    constructor(prisma, usersService, plansService, paymentsService, botService) {
        this.prisma = prisma;
        this.usersService = usersService;
        this.plansService = plansService;
        this.paymentsService = paymentsService;
        this.botService = botService;
    }
    async validateInitData(initData) {
        if (!initData) {
            throw new common_1.UnauthorizedException('Missing initData');
        }
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        if (!hash) {
            throw new common_1.UnauthorizedException('Missing hash');
        }
        params.delete('hash');
        const dataCheckArray = [];
        params.sort();
        params.forEach((value, key) => {
            dataCheckArray.push(`${key}=${value}`);
        });
        const dataCheckString = dataCheckArray.join('\n');
        const token = await this.botService.getToken();
        if (!token) {
            throw new common_1.UnauthorizedException('Bot token not configured');
        }
        const secretKey = crypto.createHash('sha256').update(token).digest();
        const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        if (hmac !== hash) {
            throw new common_1.UnauthorizedException('Invalid initData hash');
        }
        const userParam = params.get('user');
        if (!userParam) {
            throw new common_1.UnauthorizedException('Missing user in initData');
        }
        let userObj;
        try {
            userObj = JSON.parse(userParam);
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid user payload');
        }
        if (!userObj.id) {
            throw new common_1.UnauthorizedException('Invalid user id');
        }
        const telegramId = String(userObj.id);
        const name = userObj.first_name ||
            userObj.username ||
            (userObj.last_name ? `${userObj.first_name} ${userObj.last_name}` : 'User');
        return { telegramId, name };
    }
    async auth(dto) {
        const { telegramId, name } = await this.validateInitData(dto.initData);
        let user = await this.prisma.vpnUser.findFirst({
            where: { telegramId },
            include: {
                userServers: {
                    where: { isActive: true },
                    include: { server: true },
                },
                subscriptions: {
                    where: { active: true },
                    orderBy: { endsAt: 'desc' },
                    take: 1,
                },
            },
        });
        if (!user) {
            const created = await this.usersService.createFromTelegram(telegramId, name);
            user = await this.prisma.vpnUser.findUnique({
                where: { id: created.id },
                include: {
                    userServers: {
                        where: { isActive: true },
                        include: { server: true },
                    },
                    subscriptions: {
                        where: { active: true },
                        orderBy: { endsAt: 'desc' },
                        take: 1,
                    },
                },
            });
        }
        return {
            id: user.id,
            telegramId: user.telegramId,
            name: user.name,
            status: user.status,
            expiresAt: user.expiresAt,
        };
    }
    async status(dto) {
        const { telegramId } = await this.validateInitData(dto.initData);
        const user = await this.prisma.vpnUser.findFirst({
            where: { telegramId },
            include: {
                userServers: {
                    where: { isActive: true },
                    include: { server: true },
                },
                subscriptions: {
                    where: { active: true },
                    orderBy: { endsAt: 'desc' },
                    take: 1,
                },
            },
        });
        if (!user) {
            throw new common_1.UnauthorizedException('User not found, use /start in bot first');
        }
        let daysLeft = null;
        if (user.expiresAt) {
            const now = new Date();
            daysLeft = Math.ceil((user.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        }
        return {
            id: user.id,
            status: user.status,
            expiresAt: user.expiresAt,
            daysLeft,
            servers: user.userServers.map((us) => ({
                id: us.server.id,
                name: us.server.name,
            })),
            subscription: user.subscriptions[0]
                ? {
                    id: user.subscriptions[0].id,
                    periodDays: user.subscriptions[0].periodDays,
                    startsAt: user.subscriptions[0].startsAt,
                    endsAt: user.subscriptions[0].endsAt,
                }
                : null,
        };
    }
    async config(dto) {
        const { telegramId } = await this.validateInitData(dto.initData);
        const user = await this.prisma.vpnUser.findFirst({
            where: { telegramId },
        });
        if (!user) {
            throw new common_1.UnauthorizedException('User not found');
        }
        const configResult = await this.usersService.getConfig(user.id);
        if (!configResult || !configResult.configs || configResult.configs.length === 0) {
            throw new common_1.BadRequestException('No active configuration available');
        }
        return configResult;
    }
    async plans(dto) {
        const { telegramId } = await this.validateInitData(dto.initData);
        const user = await this.prisma.vpnUser.findFirst({
            where: { telegramId },
        });
        if (!user) {
            throw new common_1.UnauthorizedException('User not found');
        }
        const plans = await this.plansService.list(user.id);
        return plans.filter((p) => p.active);
    }
    async pay(dto) {
        const { telegramId } = await this.validateInitData(dto.initData);
        const user = await this.prisma.vpnUser.findFirst({
            where: { telegramId },
        });
        if (!user) {
            throw new common_1.UnauthorizedException('User not found');
        }
        const plan = await this.prisma.plan.findUnique({
            where: { id: dto.planId },
        });
        if (!plan || !plan.active || plan.isTrial) {
            throw new common_1.BadRequestException('Plan is not available');
        }
        const payment = await this.paymentsService.create({
            vpnUserId: user.id,
            planId: plan.id,
            amount: plan.price,
            currency: plan.currency,
            status: 'PAID',
        });
        if (!payment) {
            throw new common_1.BadRequestException('Failed to create payment');
        }
        return {
            paymentId: payment.id,
            status: payment.status,
        };
    }
};
exports.MiniController = MiniController;
__decorate([
    (0, common_1.Post)('auth'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [mini_auth_dto_1.MiniInitDataDto]),
    __metadata("design:returntype", Promise)
], MiniController.prototype, "auth", null);
__decorate([
    (0, common_1.Post)('status'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [mini_auth_dto_1.MiniInitDataDto]),
    __metadata("design:returntype", Promise)
], MiniController.prototype, "status", null);
__decorate([
    (0, common_1.Post)('config'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [mini_auth_dto_1.MiniInitDataDto]),
    __metadata("design:returntype", Promise)
], MiniController.prototype, "config", null);
__decorate([
    (0, common_1.Post)('plans'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [mini_auth_dto_1.MiniInitDataDto]),
    __metadata("design:returntype", Promise)
], MiniController.prototype, "plans", null);
__decorate([
    (0, common_1.Post)('pay'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [mini_pay_dto_1.MiniPayDto]),
    __metadata("design:returntype", Promise)
], MiniController.prototype, "pay", null);
exports.MiniController = MiniController = __decorate([
    (0, common_1.Controller)('mini'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        users_service_1.UsersService,
        plans_service_1.PlansService,
        payments_service_1.PaymentsService,
        bot_service_1.BotService])
], MiniController);
//# sourceMappingURL=mini.controller.js.map