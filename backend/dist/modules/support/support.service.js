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
exports.SupportService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
const telegram_bot_service_1 = require("../bot/telegram-bot.service");
let SupportService = class SupportService {
    prisma;
    telegramBotService;
    constructor(prisma, telegramBotService) {
        this.prisma = prisma;
        this.telegramBotService = telegramBotService;
    }
    async findAll(filters) {
        const where = {};
        if (filters?.status) {
            where.status = filters.status;
        }
        if (filters?.vpnUserId) {
            where.vpnUserId = filters.vpnUserId;
        }
        return this.prisma.supportMessage.findMany({
            where,
            include: {
                vpnUser: {
                    select: {
                        id: true,
                        name: true,
                        telegramId: true,
                        status: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }
    async findOne(id) {
        const message = await this.prisma.supportMessage.findUnique({
            where: { id },
            include: {
                vpnUser: {
                    select: {
                        id: true,
                        name: true,
                        telegramId: true,
                        status: true,
                    },
                },
            },
        });
        if (!message) {
            throw new common_1.NotFoundException(`Support message with ID ${id} not found`);
        }
        return message;
    }
    async findByUserId(vpnUserId) {
        return this.prisma.supportMessage.findMany({
            where: { vpnUserId },
            include: {
                vpnUser: {
                    select: {
                        id: true,
                        name: true,
                        telegramId: true,
                        status: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }
    async create(dto) {
        const user = await this.prisma.vpnUser.findUnique({
            where: { id: dto.vpnUserId },
        });
        if (!user) {
            throw new common_1.NotFoundException(`User with ID ${dto.vpnUserId} not found`);
        }
        const status = dto.status || (dto.type === client_1.SupportMessageType.USER_MESSAGE ? client_1.SupportTicketStatus.OPEN : client_1.SupportTicketStatus.OPEN);
        return this.prisma.supportMessage.create({
            data: {
                vpnUserId: dto.vpnUserId,
                type: dto.type,
                message: dto.message,
                status,
            },
            include: {
                vpnUser: {
                    select: {
                        id: true,
                        name: true,
                        telegramId: true,
                        status: true,
                    },
                },
            },
        });
    }
    async reply(messageId, dto) {
        const originalMessage = await this.findOne(messageId);
        if (originalMessage.type !== client_1.SupportMessageType.USER_MESSAGE) {
            throw new common_1.BadRequestException('Can only reply to user messages');
        }
        const user = await this.prisma.vpnUser.findUnique({
            where: { id: originalMessage.vpnUserId },
            select: { id: true, telegramId: true },
        });
        const reply = await this.create({
            vpnUserId: originalMessage.vpnUserId,
            type: client_1.SupportMessageType.ADMIN_REPLY,
            message: dto.message,
            status: client_1.SupportTicketStatus.OPEN,
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        if (!user.telegramId) {
            console.warn(`User ${user.id} does not have telegramId, cannot send support reply via Telegram`);
        }
        else {
            try {
                await this.telegramBotService.sendSupportReply(user.telegramId, dto.message);
            }
            catch (error) {
                console.error('Failed to send support reply via Telegram:', error);
            }
        }
        return reply;
    }
    async update(id, dto) {
        await this.findOne(id);
        return this.prisma.supportMessage.update({
            where: { id },
            data: dto,
            include: {
                vpnUser: {
                    select: {
                        id: true,
                        name: true,
                        telegramId: true,
                        status: true,
                    },
                },
            },
        });
    }
    async closeTicket(vpnUserId) {
        return this.prisma.supportMessage.updateMany({
            where: {
                vpnUserId,
                status: client_1.SupportTicketStatus.OPEN,
            },
            data: {
                status: client_1.SupportTicketStatus.CLOSED,
            },
        });
    }
    async remove(id) {
        await this.findOne(id);
        return this.prisma.supportMessage.delete({
            where: { id },
        });
    }
    async getOpenTicketsCount() {
        return this.prisma.supportMessage.count({
            where: {
                status: client_1.SupportTicketStatus.OPEN,
                type: client_1.SupportMessageType.USER_MESSAGE,
            },
        });
    }
};
exports.SupportService = SupportService;
exports.SupportService = SupportService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => telegram_bot_service_1.TelegramBotService))),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        telegram_bot_service_1.TelegramBotService])
], SupportService);
//# sourceMappingURL=support.service.js.map