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
var TelegramBotService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramBotService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bot_service_1 = require("./bot.service");
const users_service_1 = require("../users/users.service");
const plans_service_1 = require("../plans/plans.service");
const payments_service_1 = require("../payments/payments.service");
const support_service_1 = require("../support/support.service");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
let TelegramBotService = TelegramBotService_1 = class TelegramBotService {
    botService;
    usersService;
    plansService;
    paymentsService;
    supportService;
    prisma;
    config;
    logger = new common_1.Logger(TelegramBotService_1.name);
    bot = null;
    isRunning = false;
    supportModeUsers = new Map();
    isStarting = false;
    constructor(botService, usersService, plansService, paymentsService, supportService, prisma, config) {
        this.botService = botService;
        this.usersService = usersService;
        this.plansService = plansService;
        this.paymentsService = paymentsService;
        this.supportService = supportService;
        this.prisma = prisma;
        this.config = config;
    }
    async onModuleInit() {
        if (this.bot && this.isRunning) {
            this.logger.log('Stopping existing bot instance before restart...');
            try {
                await this.stopBot();
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            catch (error) {
                this.logger.warn('Error stopping existing bot:', error);
            }
        }
        this.startBot().catch((err) => {
            this.logger.error('Failed to start bot on module init:', err);
        });
    }
    async onModuleDestroy() {
        await this.stopBot();
    }
    async startBot() {
        if (this.isStarting) {
            this.logger.debug('Bot is already starting, skipping duplicate start');
            return;
        }
        if (this.isRunning && this.bot) {
            this.logger.debug('Bot is already running, skipping start');
            return;
        }
        this.isStarting = true;
        if (this.bot && !this.isRunning) {
            this.logger.log('Stopping existing bot instance before creating new one...');
            try {
                await this.stopBot();
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            catch (error) {
                this.logger.warn('Error stopping existing bot:', error);
            }
        }
        try {
            const token = await this.botService.getToken();
            if (!token) {
                this.logger.warn('Bot token not configured. Bot will not start.');
                return;
            }
            const { Telegraf, Markup } = await Promise.resolve().then(() => require('telegraf'));
            if (!this.bot) {
                this.bot = new Telegraf(token);
            }
            this.bot.command('cancel', async (ctx) => {
                const telegramId = ctx.from.id.toString();
                this.supportModeUsers.delete(telegramId);
                await ctx.reply('✅ Режим поддержки отменен. Используйте /start для возврата в главное меню.');
            });
            this.bot.command('start', async (ctx) => {
                const telegramId = ctx.from.id.toString();
                this.supportModeUsers.delete(telegramId);
                const userName = ctx.from.first_name || ctx.from.username || 'User';
                try {
                    let user = await this.prisma.vpnUser.findFirst({
                        where: { telegramId },
                        include: { userServers: true },
                    });
                    if (!user) {
                        const created = await this.usersService.createFromTelegram(telegramId, userName);
                        user = await this.prisma.vpnUser.findUnique({
                            where: { id: created.id },
                            include: { userServers: true },
                        });
                    }
                    if (!user) {
                        await ctx.reply('❌ Ошибка при создании пользователя. Попробуйте позже.');
                        return;
                    }
                    if (user.serverId || (user.userServers && user.userServers.length > 0)) {
                        await this.showMainMenu(ctx, user);
                        return;
                    }
                    const servers = await this.prisma.vpnServer.findMany({
                        where: { active: true },
                        orderBy: { createdAt: 'desc' },
                    });
                    if (servers.length === 0) {
                        await ctx.reply('❌ Нет доступных серверов. Обратитесь к администратору.');
                        return;
                    }
                    const buttons = servers.map((server) => [
                        Markup.button.callback(server.name, `select_server_${server.id}`),
                    ]);
                    await ctx.reply(`👋 Добро пожаловать, ${userName}!\n\n` +
                        `🚀 Выберите локацию для подключения:\n\n` +
                        `После выбора вам будет предоставлен пробный период на 3 дня.`, Markup.inlineKeyboard(buttons));
                }
                catch (error) {
                    this.logger.error('Error handling /start command:', error);
                    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
                }
            });
            this.bot.action(/^select_server_(.+)$/, async (ctx) => {
                const serverId = ctx.match[1];
                const telegramId = ctx.from.id.toString();
                const userName = ctx.from.first_name || ctx.from.username || 'User';
                try {
                    let user = await this.prisma.vpnUser.findFirst({
                        where: { telegramId },
                    });
                    if (!user) {
                        user = await this.usersService.createFromTelegram(telegramId, userName);
                    }
                    const existingUserServer = await this.prisma.userServer.findFirst({
                        where: { vpnUserId: user.id, serverId },
                    });
                    if (existingUserServer) {
                        await ctx.answerCbQuery('Эта локация уже добавлена!');
                        await this.showMainMenu(ctx, user);
                        return;
                    }
                    const server = await this.prisma.vpnServer.findUnique({
                        where: { id: serverId },
                    });
                    if (!server || !server.active) {
                        await ctx.answerCbQuery('❌ Сервер недоступен');
                        return;
                    }
                    await ctx.answerCbQuery();
                    const plans = await this.plansService.list(user.id);
                    const trialPlan = plans.find((p) => p.isTrial);
                    let paidPlans = plans.filter((p) => !p.isTrial && p.active);
                    if (paidPlans.length === 0) {
                        const allActivePlans = await this.prisma.plan.findMany({
                            where: { active: true, isTrial: false },
                            orderBy: { price: 'asc' },
                        });
                        paidPlans = allActivePlans;
                    }
                    const displayedPlans = paidPlans.slice(0, 4);
                    const maskedHost = this.maskServerHost(server.host);
                    let message = `📍 ${server.name}\n\n`;
                    message += `🌐 Сервер: ${maskedHost}:${server.port}\n`;
                    message += `🔒 Безопасность: ${server.security || 'NONE'}\n\n`;
                    if (trialPlan) {
                        message += `🎁 Пробный период:\n`;
                        message += `   ${trialPlan.periodDays} дней бесплатно\n\n`;
                    }
                    if (displayedPlans.length > 0) {
                        const middleIndex = Math.floor(displayedPlans.length / 2);
                        const recommendedPlan = displayedPlans[middleIndex];
                        const minPrice = Math.min(...displayedPlans.map(p => p.price));
                        const minPricePlan = displayedPlans.find(p => p.price === minPrice);
                        message += `💳 Тарифы после пробного периода:\n`;
                        displayedPlans.forEach((plan) => {
                            const emoji = plan.id === recommendedPlan.id ? '🔥 ' : '   ';
                            message += `${emoji}${plan.name} - ${plan.price} ${plan.currency} (${plan.periodDays} дн.)\n`;
                        });
                        if (paidPlans.length > displayedPlans.length) {
                            message += `   ... и еще ${paidPlans.length - displayedPlans.length} тарифов\n`;
                        }
                        message += `\n`;
                        message += `💰 От ${minPrice} ${minPricePlan?.currency || 'RUB'}/мес\n\n`;
                    }
                    message += `После подключения вам будет предоставлен пробный период на ${trialPlan?.periodDays || 3} дня.`;
                    const buttons = [
                        [Markup.button.callback('✅ Подтвердить и подключить', `confirm_server_${serverId}`)],
                        [Markup.button.callback('🔙 Выбрать другую локацию', 'back_to_servers')],
                    ];
                    await ctx.editMessageText(message, Markup.inlineKeyboard(buttons));
                }
                catch (error) {
                    this.logger.error('Error handling server selection:', error);
                    await ctx.answerCbQuery('❌ Ошибка при загрузке информации');
                    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
                }
            });
            this.bot.action(/^confirm_server_(.+)$/, async (ctx) => {
                const serverId = ctx.match[1];
                const telegramId = ctx.from.id.toString();
                const userName = ctx.from.first_name || ctx.from.username || 'User';
                try {
                    let user = await this.prisma.vpnUser.findFirst({
                        where: { telegramId },
                    });
                    if (!user) {
                        await ctx.answerCbQuery('❌ Пользователь не найден');
                        return;
                    }
                    const server = await this.prisma.vpnServer.findUnique({
                        where: { id: serverId },
                    });
                    if (!server || !server.active) {
                        await ctx.answerCbQuery('❌ Сервер недоступен');
                        return;
                    }
                    await ctx.answerCbQuery('⏳ Подключаем локацию...');
                    user = await this.usersService.addServerAndTrial(user.id, serverId, 3);
                    await ctx.editMessageText(`✅ Локация успешно подключена!\n\n` +
                        `📍 Локация: ${server.name}\n` +
                        `🎁 Пробный период: 3 дня\n\n` +
                        `Используйте /config для получения конфигурации VPN.\n` +
                        `Используйте /pay для продления подписки.`);
                    await this.showMainMenu(ctx, user);
                }
                catch (error) {
                    this.logger.error('Error confirming server selection:', error);
                    await ctx.answerCbQuery('❌ Ошибка при подключении локации');
                    await ctx.reply('❌ Произошла ошибка. Попробуйте позже или обратитесь к администратору.');
                }
            });
            this.bot.action('back_to_servers', async (ctx) => {
                const telegramId = ctx.from.id.toString();
                const userName = ctx.from.first_name || ctx.from.username || 'User';
                try {
                    await ctx.answerCbQuery();
                    const user = await this.prisma.vpnUser.findFirst({
                        where: { telegramId },
                        include: {
                            userServers: {
                                include: { server: true },
                            },
                        },
                    });
                    const allServers = await this.prisma.vpnServer.findMany({
                        where: { active: true },
                        orderBy: { createdAt: 'desc' },
                    });
                    if (allServers.length === 0) {
                        await ctx.editMessageText('❌ Нет доступных серверов. Обратитесь к администратору.');
                        return;
                    }
                    const { Markup } = await Promise.resolve().then(() => require('telegraf'));
                    const buttons = allServers.map((server) => [
                        Markup.button.callback(server.name, `select_server_${server.id}`),
                    ]);
                    buttons.push([Markup.button.callback('🔙 Назад в меню', 'back_to_main')]);
                    const messageText = user && user.userServers && user.userServers.length > 0
                        ? `📍 Выберите локацию:\n\nВыберите сервер для получения конфигурации или переключения.`
                        : `🚀 Выберите локацию для подключения:\n\nПосле выбора вам будет предоставлен пробный период на 3 дня.`;
                    await ctx.editMessageText(messageText, Markup.inlineKeyboard(buttons));
                }
                catch (error) {
                    this.logger.error('Error handling back to servers:', error);
                    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
                }
            });
            this.bot.command('pay', async (ctx) => {
                const telegramId = ctx.from.id.toString();
                try {
                    const user = await this.prisma.vpnUser.findFirst({
                        where: { telegramId },
                    });
                    if (!user) {
                        await ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
                        return;
                    }
                    let plans = await this.plansService.list(user.id);
                    this.logger.debug(`Found ${plans.length} plans for user ${user.id} (command /pay)`);
                    let paidPlans = plans.filter((p) => !p.isTrial && p.active);
                    this.logger.debug(`Found ${paidPlans.length} paid plans after filtering (command /pay)`);
                    if (paidPlans.length === 0) {
                        this.logger.warn(`No paid plans available for user ${user.id} (command /pay), trying to show all active plans`);
                        const allActivePlans = await this.prisma.plan.findMany({
                            where: { active: true, isTrial: false },
                            orderBy: { price: 'asc' },
                        });
                        if (allActivePlans.length === 0) {
                            await ctx.reply('❌ Нет доступных тарифов для оплаты.\n\n' +
                                'Обратитесь к администратору для активации тарифов.');
                            return;
                        }
                        paidPlans = allActivePlans;
                        this.logger.debug(`Using ${paidPlans.length} active plans as fallback (command /pay)`);
                    }
                    const buttons = paidPlans.map((plan) => [
                        Markup.button.callback(`${plan.name} - ${plan.price} ${plan.currency} (${plan.periodDays} дн.)`, `select_plan_${plan.id}`),
                    ]);
                    buttons.push([Markup.button.callback('🔙 Назад в меню', 'back_to_main')]);
                    await ctx.reply(`💳 Выберите тариф для оплаты:\n\n` +
                        `После оплаты подписка будет автоматически активирована.`, Markup.inlineKeyboard(buttons));
                }
                catch (error) {
                    this.logger.error('Error handling /pay command:', error);
                    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
                }
            });
            this.bot.action(/^select_plan_(.+)$/, async (ctx) => {
                const planId = ctx.match[1];
                const telegramId = ctx.from.id.toString();
                try {
                    await ctx.answerCbQuery('⏳ Обрабатываем...');
                    const user = await this.prisma.vpnUser.findFirst({
                        where: { telegramId },
                    });
                    if (!user) {
                        await ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
                        return;
                    }
                    const plan = await this.prisma.plan.findUnique({
                        where: { id: planId },
                    });
                    if (!plan || !plan.active || plan.isTrial) {
                        await ctx.reply('❌ Тариф недоступен или не найден.');
                        return;
                    }
                    await this.paymentsService.create({
                        vpnUserId: user.id,
                        planId: plan.id,
                        amount: plan.price,
                        currency: plan.currency,
                        status: 'PAID',
                    });
                    try {
                        await ctx.editMessageText(`✅ Платеж успешно обработан!\n\n` +
                            `📦 Тариф: ${plan.name}\n` +
                            `💰 Сумма: ${plan.price} ${plan.currency}\n` +
                            `📅 Период: ${plan.periodDays} дней\n\n` +
                            `Подписка активирована. Используйте /config для получения конфигурации.`);
                    }
                    catch (editError) {
                        await ctx.reply(`✅ Платеж успешно обработан!\n\n` +
                            `📦 Тариф: ${plan.name}\n` +
                            `💰 Сумма: ${plan.price} ${plan.currency}\n` +
                            `📅 Период: ${plan.periodDays} дней\n\n` +
                            `Подписка активирована. Используйте /config для получения конфигурации.`);
                    }
                }
                catch (error) {
                    this.logger.error('Error handling plan selection:', error);
                    await ctx.answerCbQuery('❌ Ошибка при создании платежа');
                    await ctx.reply(`❌ Произошла ошибка при обработке платежа.\n\n` +
                        `Ошибка: ${error?.message || 'Неизвестная ошибка'}\n\n` +
                        `Попробуйте позже или обратитесь к администратору.`);
                }
            });
            this.bot.command('config', async (ctx) => {
                this.logger.log('Command /config received');
                const telegramId = ctx.from.id.toString();
                try {
                    const user = await this.prisma.vpnUser.findFirst({
                        where: { telegramId },
                        include: {
                            userServers: {
                                where: { isActive: true },
                                include: { server: true },
                            },
                        },
                    });
                    if (!user) {
                        await ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
                        return;
                    }
                    if (user.status === 'BLOCKED') {
                        await ctx.reply('❌ Ваш аккаунт заблокирован. Обратитесь к администратору.');
                        return;
                    }
                    if (user.status === 'EXPIRED') {
                        await ctx.reply('❌ Ваша подписка истекла. Используйте /pay для продления подписки.');
                        return;
                    }
                    if (!user.userServers || user.userServers.length === 0) {
                        await ctx.reply('❌ У вас нет активного сервера.\n\n' +
                            '📍 Используйте /start и выберите локацию для активации пробного периода.');
                        return;
                    }
                    const configResult = await this.usersService.getConfig(user.id);
                    if (!configResult || !configResult.configs || configResult.configs.length === 0) {
                        await ctx.reply('❌ Конфигурация недоступна.\n\n' +
                            'Возможные причины:\n' +
                            '• У вас нет активного сервера\n' +
                            '• Сервер временно недоступен\n\n' +
                            '📍 Используйте /start и выберите локацию для активации.');
                        return;
                    }
                    const configUrl = configResult.configs[0].url;
                    const serverName = configResult.configs[0].serverName;
                    try {
                        const QRCode = await Promise.resolve().then(() => require('qrcode'));
                        const qrBuffer = await QRCode.toBuffer(configUrl, {
                            errorCorrectionLevel: 'M',
                            type: 'png',
                            width: 400,
                            margin: 2,
                        });
                        await ctx.replyWithPhoto({ source: qrBuffer }, {
                            caption: `📱 QR код для быстрого подключения (${serverName})\n\nОтсканируйте QR код в вашем VPN клиенте для автоматической настройки.`,
                        });
                    }
                    catch (qrError) {
                        this.logger.error('Failed to generate QR code:', qrError);
                        await ctx.reply('⚠️ Не удалось сгенерировать QR код, но конфигурация доступна ниже.');
                    }
                    const shortUrl = configUrl.length > 80
                        ? `${configUrl.substring(0, 60)}...${configUrl.substring(configUrl.length - 20)}`
                        : configUrl;
                    await ctx.reply(`📥 Конфигурация VPN (${serverName}):\n\n` +
                        `\`\`\`\n${configUrl}\n\`\`\`\n\n` +
                        `Скопируйте ссылку выше или используйте QR код.`, { parse_mode: 'Markdown' });
                }
                catch (error) {
                    this.logger.error('Error handling /config command:', error);
                    await ctx.reply('❌ Произошла ошибка при получении конфигурации.\n\n' +
                        'Возможные причины:\n' +
                        '• Проблемы с подключением к серверу\n' +
                        '• Временная недоступность сервиса\n\n' +
                        'Попробуйте позже или обратитесь в поддержку через /support.');
                }
            });
            this.bot.command('support', async (ctx) => {
                this.logger.log('Command /support received');
                const telegramId = ctx.from.id.toString();
                try {
                    const user = await this.prisma.vpnUser.findFirst({
                        where: { telegramId },
                    });
                    if (!user) {
                        this.logger.warn(`User not found for telegramId: ${telegramId}`);
                        await ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
                        return;
                    }
                    this.supportModeUsers.set(telegramId, true);
                    this.logger.log(`Support mode activated for user: ${telegramId}`);
                    await ctx.reply('💬 Режим поддержки активирован.\n\n' +
                        'Напишите ваш вопрос, и мы ответим вам в ближайшее время.\n\n' +
                        'Для выхода из режима поддержки используйте команду /cancel или /start');
                }
                catch (error) {
                    this.logger.error('Error handling /support command:', error);
                    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
                }
            });
            this.bot.command('help', async (ctx) => {
                try {
                    const helpMessage = `❓ Помощь и инструкции\n\n` +
                        `📱 Приложения для подключения:\n\n` +
                        `• iOS:\n` +
                        `  - v2rayNG (App Store)\n` +
                        `  - Shadowrocket (App Store)\n\n` +
                        `• Android:\n` +
                        `  - v2rayNG (Google Play / GitHub)\n` +
                        `  - V2rayTun (Google Play)\n` +
                        `  - Clash for Android\n\n` +
                        `• Windows:\n` +
                        `  - v2rayN (GitHub)\n` +
                        `  - Clash for Windows\n\n` +
                        `• macOS:\n` +
                        `  - ClashX (GitHub)\n` +
                        `  - v2rayU (GitHub)\n\n` +
                        `• Linux:\n` +
                        `  - v2ray-core (GitHub)\n` +
                        `  - Qv2ray (GitHub)\n\n` +
                        `📥 Как подключиться:\n\n` +
                        `1. Скачайте приложение для вашей платформы\n` +
                        `2. Используйте команду /config для получения конфигурации\n` +
                        `3. Отсканируйте QR-код или скопируйте ссылку конфигурации\n` +
                        `4. Импортируйте конфигурацию в приложение\n` +
                        `5. Включите VPN соединение\n\n` +
                        `🔗 Полезные ссылки:\n\n` +
                        `• v2rayNG: https://github.com/2dust/v2rayNG\n` +
                        `• v2rayN: https://github.com/2dust/v2rayN\n` +
                        `• Clash: https://github.com/Dreamacro/clash\n\n` +
                        `💡 Команды бота:\n\n` +
                        `• /start - Главное меню\n` +
                        `• /config - Получить конфигурацию\n` +
                        `• /pay - Оплатить подписку\n` +
                        `• /status - Статус подписки\n` +
                        `• /support - Связаться с поддержкой\n` +
                        `• /help - Показать эту справку\n\n` +
                        `❓ Если возникли проблемы, используйте команду /support для связи с нами.`;
                    await ctx.reply(helpMessage);
                }
                catch (error) {
                    this.logger.error('Error handling /help command:', error);
                    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
                }
            });
            this.bot.command('status', async (ctx) => {
                this.logger.log('Command /status received');
                const telegramId = ctx.from.id.toString();
                try {
                    const user = await this.prisma.vpnUser.findFirst({
                        where: { telegramId },
                        include: {
                            subscriptions: {
                                where: { active: true },
                                orderBy: { endsAt: 'desc' },
                                take: 1,
                            },
                            userServers: {
                                where: { isActive: true },
                                include: { server: true },
                            },
                        },
                    });
                    if (!user) {
                        await ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
                        return;
                    }
                    const statusEmoji = {
                        ACTIVE: '✅',
                        BLOCKED: '🚫',
                        EXPIRED: '⏰',
                    };
                    let message = `${statusEmoji[user.status]} Статус аккаунта: ${user.status}\n\n`;
                    if (user.expiresAt) {
                        const expiresAt = new Date(user.expiresAt);
                        const now = new Date();
                        const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                        if (daysLeft > 0) {
                            message += `📅 Подписка действительна до: ${expiresAt.toLocaleDateString('ru-RU')}\n`;
                            message += `⏳ Осталось дней: ${daysLeft}\n`;
                        }
                        else {
                            message += `⏰ Подписка истекла\n`;
                            message += `💳 Используйте /pay для продления подписки\n`;
                        }
                    }
                    else {
                        message += `📅 Подписка не установлена\n`;
                        if (!user.userServers || user.userServers.length === 0) {
                            message += `📍 Используйте /start и выберите локацию для активации пробного периода\n`;
                        }
                    }
                    if (user.userServers && user.userServers.length > 0) {
                        message += `\n🌐 Активные серверы:\n`;
                        user.userServers.forEach((userServer) => {
                            message += `  • ${userServer.server.name}\n`;
                        });
                    }
                    else {
                        message += `\n🌐 Активных серверов нет\n`;
                        message += `📍 Используйте /start для выбора локации\n`;
                    }
                    if (user.subscriptions && user.subscriptions.length > 0) {
                        const activeSubscription = user.subscriptions[0];
                        message += `\n📦 Активная подписка:\n`;
                        message += `  • Период: ${activeSubscription.periodDays} дней\n`;
                        message += `  • Начало: ${new Date(activeSubscription.startsAt).toLocaleDateString('ru-RU')}\n`;
                        message += `  • Конец: ${new Date(activeSubscription.endsAt).toLocaleDateString('ru-RU')}\n`;
                    }
                    await ctx.reply(message);
                }
                catch (error) {
                    this.logger.error('Error handling /status command:', error);
                    await ctx.reply('❌ Произошла ошибка при получении статуса.\n\n' +
                        'Возможные причины:\n' +
                        '• Проблемы с подключением к базе данных\n' +
                        '• Временная недоступность сервиса\n\n' +
                        'Попробуйте позже или обратитесь в поддержку через /support.');
                }
            });
            this.setupMenuHandlers();
            this.bot.catch((err, ctx) => {
                this.logger.error('Bot error:', err);
                ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
            });
            await this.bot.telegram.setMyCommands([
                { command: 'start', description: '🏠 Главное меню' },
                { command: 'config', description: '📥 Получить конфигурацию VPN' },
                { command: 'pay', description: '💳 Оплатить подписку' },
                { command: 'status', description: '📊 Статус подписки' },
                { command: 'support', description: '💬 Поддержка' },
                { command: 'help', description: '❓ Помощь и инструкции' },
                { command: 'cancel', description: '❌ Отменить режим поддержки' },
            ]);
            try {
                await this.bot.telegram.setMyCommands([
                    { command: 'start', description: '🏠 Главное меню' },
                    { command: 'config', description: '📥 Получить конфигурацию VPN' },
                    { command: 'pay', description: '💳 Оплатить подписку' },
                    { command: 'status', description: '📊 Статус подписки' },
                    { command: 'support', description: '💬 Поддержка' },
                    { command: 'help', description: '❓ Помощь и инструкции' },
                    { command: 'cancel', description: '❌ Отменить режим поддержки' },
                ]);
                this.logger.log('Bot commands registered successfully');
            }
            catch (error) {
                this.logger.warn('Failed to register bot commands:', error);
            }
            await this.bot.launch();
            this.isRunning = true;
            this.logger.log('Telegram bot started successfully');
            process.once('SIGINT', () => this.stopBot());
            process.once('SIGTERM', () => this.stopBot());
        }
        catch (error) {
            this.logger.error('Failed to start bot:', error);
        }
        finally {
            this.isStarting = false;
        }
    }
    maskServerHost(host) {
        if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
            const parts = host.split('.');
            return `${parts[0]}.${parts[1]}.*.*`;
        }
        const domainParts = host.split('.');
        if (domainParts.length > 2) {
            return `*.${domainParts.slice(-2).join('.')}`;
        }
        return host.length > 10 ? `${host.substring(0, 3)}***` : '***';
    }
    async showMainMenu(ctx, user) {
        const { Markup } = await Promise.resolve().then(() => require('telegraf'));
        const miniAppUrl = this.config.get('TELEGRAM_MINI_APP_URL');
        const buttons = [
            [Markup.button.callback('📥 Получить конфиг', 'get_config')],
            [Markup.button.callback('💳 Оплатить подписку', 'show_pay')],
            [Markup.button.callback('📊 Статус подписки', 'show_status')],
            [Markup.button.callback('📍 Выбрать другую локацию', 'back_to_servers')],
        ];
        if (miniAppUrl && miniAppUrl.startsWith('https://')) {
            buttons.push([Markup.button.webApp('📱 Открыть мини‑приложение', miniAppUrl)]);
        }
        await ctx.reply('🏠 Главное меню:', Markup.inlineKeyboard(buttons));
    }
    setupMenuHandlers() {
        this.bot.action('get_config', async (ctx) => {
            const telegramId = ctx.from.id.toString();
            const user = await this.prisma.vpnUser.findFirst({
                where: { telegramId },
            });
            if (!user) {
                await ctx.answerCbQuery('❌ Пользователь не найден');
                return;
            }
            if (user.status === 'EXPIRED') {
                await ctx.answerCbQuery('❌ Подписка истекла. Используйте /pay');
                return;
            }
            const configResult = await this.usersService.getConfig(user.id);
            if (!configResult || !configResult.configs || configResult.configs.length === 0) {
                await ctx.answerCbQuery('❌ Конфигурация недоступна');
                return;
            }
            const configUrl = configResult.configs[0].url;
            const serverName = configResult.configs[0].serverName;
            await ctx.answerCbQuery();
            try {
                const QRCode = await Promise.resolve().then(() => require('qrcode'));
                const { Markup } = await Promise.resolve().then(() => require('telegraf'));
                const qrBuffer = await QRCode.toBuffer(configUrl, {
                    errorCorrectionLevel: 'M',
                    type: 'png',
                    width: 400,
                    margin: 2,
                });
                await ctx.replyWithPhoto({ source: qrBuffer }, {
                    caption: `📱 QR код для быстрого подключения (${serverName})\n\nОтсканируйте QR код в вашем VPN клиенте для автоматической настройки.`,
                });
            }
            catch (qrError) {
                this.logger.error('Failed to generate QR code:', qrError);
            }
            await ctx.reply(`📥 Конфигурация VPN (${serverName}):\n\n` +
                `\`\`\`\n${configUrl}\n\`\`\`\n\n` +
                `Скопируйте ссылку выше или используйте QR код.`, { parse_mode: 'Markdown' });
        });
        this.bot.action('show_pay', async (ctx) => {
            const telegramId = ctx.from.id.toString();
            try {
                const user = await this.prisma.vpnUser.findFirst({
                    where: { telegramId },
                });
                if (!user) {
                    await ctx.answerCbQuery('❌ Пользователь не найден');
                    return;
                }
                let plans = await this.plansService.list(user.id);
                this.logger.debug(`Found ${plans.length} plans for user ${user.id}`);
                let paidPlans = plans.filter((p) => !p.isTrial && p.active);
                this.logger.debug(`Found ${paidPlans.length} paid plans after filtering`);
                if (paidPlans.length === 0) {
                    this.logger.warn(`No paid plans available for user ${user.id}, trying to show all active plans`);
                    const allActivePlans = await this.prisma.plan.findMany({
                        where: { active: true, isTrial: false },
                        orderBy: { price: 'asc' },
                    });
                    if (allActivePlans.length === 0) {
                        await ctx.answerCbQuery('❌ Нет доступных тарифов');
                        await ctx.reply('❌ Нет доступных тарифов для оплаты.\n\n' +
                            'Обратитесь к администратору для активации тарифов.');
                        return;
                    }
                    paidPlans = allActivePlans;
                    this.logger.debug(`Using ${paidPlans.length} active plans as fallback`);
                }
                const { Markup } = await Promise.resolve().then(() => require('telegraf'));
                const buttons = paidPlans.map((plan) => [
                    Markup.button.callback(`${plan.name} - ${plan.price} ${plan.currency} (${plan.periodDays} дн.)`, `select_plan_${plan.id}`),
                ]);
                buttons.push([Markup.button.callback('🔙 Назад в меню', 'back_to_main')]);
                await ctx.answerCbQuery();
                try {
                    await ctx.editMessageText(`💳 Выберите тариф для оплаты:\n\n` +
                        `После оплаты подписка будет автоматически активирована.`, Markup.inlineKeyboard(buttons));
                }
                catch (editError) {
                    await ctx.reply(`💳 Выберите тариф для оплаты:\n\n` +
                        `После оплаты подписка будет автоматически активирована.`, Markup.inlineKeyboard(buttons));
                }
            }
            catch (error) {
                this.logger.error('Error handling show_pay action:', error);
                await ctx.answerCbQuery('❌ Произошла ошибка');
                await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
            }
        });
        this.bot.action('back_to_main', async (ctx) => {
            const telegramId = ctx.from.id.toString();
            try {
                const user = await this.prisma.vpnUser.findFirst({
                    where: { telegramId },
                    include: { userServers: true },
                });
                if (!user) {
                    await ctx.answerCbQuery('❌ Пользователь не найден');
                    return;
                }
                await ctx.answerCbQuery();
                try {
                    const { Markup } = await Promise.resolve().then(() => require('telegraf'));
                    const miniAppUrl = this.config.get('TELEGRAM_MINI_APP_URL');
                    const buttons = [
                        [Markup.button.callback('📥 Получить конфиг', 'get_config')],
                        [Markup.button.callback('💳 Оплатить подписку', 'show_pay')],
                        [Markup.button.callback('📊 Статус подписки', 'show_status')],
                        [Markup.button.callback('📍 Выбрать другую локацию', 'back_to_servers')],
                    ];
                    if (miniAppUrl && miniAppUrl.startsWith('https://')) {
                        buttons.push([Markup.button.webApp('📱 Открыть мини‑приложение', miniAppUrl)]);
                    }
                    await ctx.editMessageText('🏠 Главное меню:', Markup.inlineKeyboard(buttons));
                }
                catch (editError) {
                    await this.showMainMenu(ctx, user);
                }
            }
            catch (error) {
                this.logger.error('Error handling back_to_main action:', error);
                await ctx.answerCbQuery('❌ Произошла ошибка');
            }
        });
        this.bot.action('show_status', async (ctx) => {
            const telegramId = ctx.from.id.toString();
            try {
                const user = await this.prisma.vpnUser.findFirst({
                    where: { telegramId },
                    include: {
                        subscriptions: {
                            where: { active: true },
                            orderBy: { endsAt: 'desc' },
                            take: 1,
                        },
                    },
                });
                if (!user) {
                    await ctx.answerCbQuery('❌ Пользователь не найден');
                    return;
                }
                const statusEmoji = {
                    ACTIVE: '✅',
                    BLOCKED: '🚫',
                    EXPIRED: '⏰',
                };
                let statusText = `\n\n${statusEmoji[user.status]} Статус: ${user.status}`;
                if (user.expiresAt) {
                    const expiresAt = new Date(user.expiresAt);
                    const now = new Date();
                    const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    if (daysLeft > 0) {
                        statusText += `\n📅 До: ${expiresAt.toLocaleDateString('ru-RU')}`;
                        statusText += `\n⏳ Осталось: ${daysLeft} дн.`;
                    }
                    else {
                        statusText += `\n⏰ Подписка истекла`;
                    }
                }
                else {
                    statusText += `\n📅 Подписка не установлена`;
                }
                const { Markup } = await Promise.resolve().then(() => require('telegraf'));
                const miniAppUrl = this.config.get('TELEGRAM_MINI_APP_URL');
                const buttons = [
                    [Markup.button.callback('📥 Получить конфиг', 'get_config')],
                    [Markup.button.callback('💳 Оплатить подписку', 'show_pay')],
                    [Markup.button.callback('📊 Статус подписки', 'show_status')],
                    [Markup.button.callback('📍 Выбрать другую локацию', 'back_to_servers')],
                ];
                if (miniAppUrl && miniAppUrl.startsWith('https://')) {
                    buttons.push([Markup.button.webApp('📱 Открыть мини‑приложение', miniAppUrl)]);
                }
                await ctx.answerCbQuery();
                try {
                    await ctx.editMessageText(`🏠 Главное меню:${statusText}`, Markup.inlineKeyboard(buttons));
                }
                catch (editError) {
                    await ctx.reply(`🏠 Главное меню:${statusText}`, Markup.inlineKeyboard(buttons));
                }
            }
            catch (error) {
                this.logger.error('Error handling show_status action:', error);
                await ctx.answerCbQuery('❌ Произошла ошибка');
            }
        });
        this.bot.action('start_support', async (ctx) => {
            const telegramId = ctx.from.id.toString();
            try {
                const user = await this.prisma.vpnUser.findFirst({
                    where: { telegramId },
                });
                if (!user) {
                    await ctx.answerCbQuery('❌ Пользователь не найден');
                    return;
                }
                this.supportModeUsers.set(telegramId, true);
                await ctx.answerCbQuery();
                await ctx.reply('💬 Режим поддержки активирован.\n\n' +
                    'Напишите ваш вопрос, и мы ответим вам в ближайшее время.\n\n' +
                    'Для выхода из режима поддержки используйте команду /cancel или /start');
            }
            catch (error) {
                this.logger.error('Error starting support mode:', error);
                await ctx.answerCbQuery('❌ Произошла ошибка');
            }
        });
        this.bot.on('text', async (ctx) => {
            if (ctx.message.text?.startsWith('/')) {
                return;
            }
            const telegramId = ctx.from.id.toString();
            if (!this.supportModeUsers.get(telegramId)) {
                return;
            }
            const messageText = ctx.message.text;
            if (!messageText || messageText.trim().length === 0) {
                return;
            }
            try {
                const user = await this.prisma.vpnUser.findFirst({
                    where: { telegramId },
                });
                if (!user) {
                    await ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
                    this.supportModeUsers.delete(telegramId);
                    return;
                }
                await this.supportService.create({
                    vpnUserId: user.id,
                    type: client_1.SupportMessageType.USER_MESSAGE,
                    message: messageText,
                });
                await ctx.reply('✅ Ваше сообщение отправлено в поддержку. Мы ответим вам в ближайшее время.\n\n' +
                    'Вы можете продолжить общение, просто отправьте новое сообщение.\n' +
                    'Для выхода из режима поддержки используйте команду /cancel или /start');
            }
            catch (error) {
                this.logger.error('Error handling user message:', error);
                await ctx.reply('❌ Произошла ошибка при отправке сообщения. Попробуйте позже.');
            }
        });
    }
    async sendSupportReply(telegramId, message) {
        this.logger.log(`sendSupportReply called: telegramId=${telegramId}, bot=${!!this.bot}, isRunning=${this.isRunning}`);
        if (!telegramId || telegramId.trim() === '') {
            this.logger.warn('Cannot send support reply: telegramId is missing or empty');
            return;
        }
        if (!this.bot) {
            this.logger.warn('Cannot send support reply: bot instance is not initialized');
            return;
        }
        try {
            this.logger.log(`Sending support reply to ${telegramId}`);
            await this.bot.telegram.sendMessage(telegramId, `💬 Ответ от поддержки:\n\n${message}`);
            this.logger.log(`Support reply sent successfully to ${telegramId}`);
        }
        catch (error) {
            this.logger.error(`Failed to send support reply to ${telegramId}:`, error);
        }
    }
    async stopBot() {
        if (!this.bot) {
            this.isRunning = false;
            return;
        }
        try {
            if (this.isRunning) {
                await this.bot.stop();
            }
            this.isRunning = false;
            this.logger.log('Telegram bot stopped');
        }
        catch (error) {
            this.logger.error('Error stopping bot:', error);
            this.isRunning = false;
        }
    }
    async restartBot() {
        if (this.isStarting) {
            this.logger.debug('Bot is already starting/restarting, skipping duplicate restart');
            return;
        }
        this.logger.log('Restarting bot...');
        await this.stopBot();
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.startBot();
    }
};
exports.TelegramBotService = TelegramBotService;
exports.TelegramBotService = TelegramBotService = TelegramBotService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)((0, common_1.forwardRef)(() => bot_service_1.BotService))),
    __metadata("design:paramtypes", [bot_service_1.BotService,
        users_service_1.UsersService,
        plans_service_1.PlansService,
        payments_service_1.PaymentsService,
        support_service_1.SupportService,
        prisma_service_1.PrismaService,
        config_1.ConfigService])
], TelegramBotService);
//# sourceMappingURL=telegram-bot.service.js.map