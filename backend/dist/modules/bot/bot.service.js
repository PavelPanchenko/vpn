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
exports.BotService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const secret_box_1 = require("../../common/crypto/secret-box");
const telegram_bot_service_1 = require("./telegram-bot.service");
let BotService = class BotService {
    prisma;
    config;
    telegramBotService;
    constructor(prisma, config, telegramBotService) {
        this.prisma = prisma;
        this.config = config;
        this.telegramBotService = telegramBotService;
    }
    getEncryptionSecret() {
        return this.config.getOrThrow('PANEL_CRED_SECRET');
    }
    maskConfig(config) {
        const { tokenEnc, ...rest } = config;
        return rest;
    }
    async get() {
        const config = await this.prisma.botConfig.findFirst({
            orderBy: { createdAt: 'desc' },
        });
        if (!config) {
            return null;
        }
        return this.maskConfig(config);
    }
    async getToken() {
        const config = await this.prisma.botConfig.findFirst({
            where: { active: true },
            orderBy: { createdAt: 'desc' },
        });
        if (!config) {
            return null;
        }
        try {
            return secret_box_1.SecretBox.decrypt(config.tokenEnc, this.getEncryptionSecret());
        }
        catch (error) {
            throw new common_1.BadRequestException('Failed to decrypt bot token');
        }
    }
    async create(dto) {
        const existing = await this.prisma.botConfig.findFirst({
            where: { active: true },
        });
        if (existing && dto.active !== false) {
            throw new common_1.BadRequestException('An active bot configuration already exists. Deactivate it first or update existing one.');
        }
        const tokenEnc = secret_box_1.SecretBox.encrypt(dto.token, this.getEncryptionSecret());
        const created = await this.prisma.botConfig.create({
            data: {
                tokenEnc,
                active: dto.active ?? false,
            },
        });
        if (created.active) {
            this.telegramBotService.restartBot().catch((err) => {
                console.error('Failed to restart bot after creation:', err);
            });
            const usersCount = await this.prisma.vpnUser.count({
                where: { telegramId: { not: null } },
            });
            if (usersCount > 0) {
                console.log(`New bot activated. ${usersCount} existing users will be automatically available (identified by telegramId).`);
            }
        }
        return this.maskConfig(created);
    }
    async update(id, dto) {
        const config = await this.prisma.botConfig.findUnique({ where: { id } });
        if (!config) {
            throw new common_1.NotFoundException('Bot configuration not found');
        }
        if (dto.active === true) {
            await this.prisma.botConfig.updateMany({
                where: { id: { not: id }, active: true },
                data: { active: false },
            });
        }
        const updateData = {};
        const isTokenChanging = dto.token !== undefined;
        if (isTokenChanging && dto.token) {
            updateData.tokenEnc = secret_box_1.SecretBox.encrypt(dto.token, this.getEncryptionSecret());
        }
        if (dto.active !== undefined) {
            updateData.active = dto.active;
        }
        const updated = await this.prisma.botConfig.update({
            where: { id },
            data: updateData,
        });
        if (isTokenChanging || dto.active !== undefined) {
            this.telegramBotService.restartBot().catch((err) => {
                console.error('Failed to restart bot after update:', err);
            });
            if (isTokenChanging && updated.active) {
                const usersCount = await this.prisma.vpnUser.count({
                    where: { telegramId: { not: null } },
                });
                console.log(`Bot token updated. ${usersCount} existing users will be automatically available in the new bot (identified by telegramId).`);
            }
        }
        return this.maskConfig(updated);
    }
    async remove(id) {
        const config = await this.prisma.botConfig.findUnique({ where: { id } });
        if (!config) {
            throw new common_1.NotFoundException('Bot configuration not found');
        }
        if (config.active) {
            this.telegramBotService.stopBot().catch((err) => {
                console.error('Failed to stop bot before deletion:', err);
            });
        }
        await this.prisma.botConfig.delete({ where: { id } });
        return { message: 'Bot configuration deleted' };
    }
};
exports.BotService = BotService;
exports.BotService = BotService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => telegram_bot_service_1.TelegramBotService))),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        telegram_bot_service_1.TelegramBotService])
], BotService);
//# sourceMappingURL=bot.service.js.map