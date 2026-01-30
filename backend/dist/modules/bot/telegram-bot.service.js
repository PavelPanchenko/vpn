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
    tokenInUse = null;
    pollingLockAcquired = false;
    pollingLockKey = 987654321;
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
            try {
                const res = await this.prisma.$queryRaw `
          SELECT pg_try_advisory_lock(${this.pollingLockKey}) AS got
        `;
                const got = Boolean(res?.[0]?.got);
                if (!got) {
                    this.logger.warn('Another backend instance holds Telegram polling lock. Skipping bot launch to avoid 409.');
                    return;
                }
                this.pollingLockAcquired = true;
            }
            catch (lockError) {
                this.logger.error('Failed to acquire Telegram polling lock. Bot will not start.', lockError);
                return;
            }
            const { Telegraf, Markup } = await Promise.resolve().then(() => require('telegraf'));
            if (this.bot && this.tokenInUse !== token) {
                this.logger.log('Bot token changed. Recreating bot instance...');
                await this.stopBot(false);
            }
            if (!this.bot) {
                this.bot = new Telegraf(token);
                this.tokenInUse = token;
                this.supportModeUsers.clear();
            }
            this.bot.command('cancel', async (ctx) => {
                const telegramId = ctx.from.id.toString();
                this.supportModeUsers.delete(telegramId);
                await this.replyHtml(ctx, `✅ <b>Режим поддержки выключен</b>\n\n` +
                    `Вернуться в меню: <code>/start</code>`);
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
                    const trialDays = await this.getTrialDaysForUser(user.id);
                    await this.replyHtml(ctx, `👋 Привет, <b>${this.esc(userName)}</b>!\n\n` +
                        `Выберите локацию для подключения.\n` +
                        `После первого подключения будет <b>пробный период на ${this.esc(trialDays)} дн.</b>`, Markup.inlineKeyboard(buttons));
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
                    const sec = server.security || 'NONE';
                    const trialDays = this.getTrialDaysFromPlans(plans);
                    let message = `📍 <b>${this.esc(server.name)}</b>\n` +
                        `<i>${this.esc(maskedHost)}:${this.esc(server.port)} · ${this.esc(sec)}</i>\n\n` +
                        `🎁 Пробный доступ: <b>${this.esc(trialDays)} дн.</b>\n`;
                    if (displayedPlans.length > 0) {
                        const middleIndex = Math.floor(displayedPlans.length / 2);
                        const recommendedPlan = displayedPlans[middleIndex];
                        const minPrice = Math.min(...displayedPlans.map((p) => p.price));
                        const minPricePlan = displayedPlans.find((p) => p.price === minPrice);
                        message += `\n<b>Тарифы после пробного периода</b>\n`;
                        displayedPlans.forEach((plan) => {
                            const tag = plan.id === recommendedPlan?.id ? ' ⭐' : '';
                            message += `• <b>${this.esc(plan.name)}</b>${tag} — ${this.esc(plan.price)} ${this.esc(plan.currency)} / ${this.esc(plan.periodDays)} дн.\n`;
                        });
                        if (paidPlans.length > displayedPlans.length) {
                            message += `• …ещё ${this.esc(paidPlans.length - displayedPlans.length)} тарифов\n`;
                        }
                        message += `\n💰 От <b>${this.esc(minPrice)} ${this.esc(minPricePlan?.currency || 'RUB')}</b>\n`;
                    }
                    message += `\nНажмите «Подтвердить», чтобы подключиться.`;
                    const buttons = [
                        [Markup.button.callback('✅ Подтвердить и подключить', `confirm_server_${serverId}`)],
                        [Markup.button.callback('🔙 Выбрать другую локацию', 'back_to_servers')],
                    ];
                    await this.editHtml(ctx, message, Markup.inlineKeyboard(buttons));
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
                    const trialDays = await this.getTrialDaysForUser(user.id);
                    const result = await this.usersService.addServerAndTrial(user.id, serverId, trialDays);
                    const updatedUser = result.updated;
                    if (!updatedUser)
                        return;
                    const expiresAtStr = updatedUser.expiresAt ? new Date(updatedUser.expiresAt).toLocaleDateString('ru-RU') : null;
                    const periodLine = result.trialCreated
                        ? `🎁 Пробный период: ${this.esc(trialDays)} дн.\n\n`
                        : (expiresAtStr
                            ? `📅 Подписка активна до: ${expiresAtStr}\n\n`
                            : '\n');
                    await ctx.editMessageText(`✅ Локация успешно подключена!\n\n` +
                        `📍 Локация: ${server.name}\n` +
                        periodLine +
                        `Используйте /config для получения конфигурации VPN.\n` +
                        `Используйте /pay для продления подписки.`);
                    await this.showMainMenu(ctx, updatedUser);
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
                    const trialDays = user ? await this.getTrialDaysForUser(user.id) : 3;
                    const messageText = user && user.userServers && user.userServers.length > 0
                        ? `📍 Выберите локацию:\n\nВыберите сервер для получения конфигурации или переключения.`
                        : `🚀 Выберите локацию для подключения:\n\nПосле выбора вам будет предоставлен пробный период на ${this.esc(trialDays)} дн.`;
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
                            await this.replyHtml(ctx, `❌ <b>Нет доступных тарифов</b>\n\n` +
                                `Попробуйте позже или напишите в поддержку: <code>/support</code>`);
                            return;
                        }
                        paidPlans = allActivePlans;
                        this.logger.debug(`Using ${paidPlans.length} active plans as fallback (command /pay)`);
                    }
                    const buttons = paidPlans.map((plan) => [
                        Markup.button.callback(this.planBtnLabel(plan), `select_plan_${plan.id}`),
                    ]);
                    await this.replyHtml(ctx, `💳 <b>Оплата подписки</b>\n\n` +
                        `Выберите тариф ниже — после оплаты подписка активируется автоматически.`, Markup.inlineKeyboard(buttons));
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
                        await this.editHtml(ctx, `✅ <b>Оплата прошла</b>\n\n` +
                            `📦 Тариф: <b>${this.esc(plan.name)}</b>\n` +
                            `💰 Сумма: <b>${this.esc(plan.price)} ${this.esc(plan.currency)}</b>\n` +
                            `📅 Период: <b>${this.esc(plan.periodDays)}</b> дн.\n\n` +
                            `Далее: получить конфиг — <code>/config</code>`);
                    }
                    catch (editError) {
                        await this.replyHtml(ctx, `✅ <b>Оплата прошла</b>\n\n` +
                            `📦 Тариф: <b>${this.esc(plan.name)}</b>\n` +
                            `💰 Сумма: <b>${this.esc(plan.price)} ${this.esc(plan.currency)}</b>\n` +
                            `📅 Период: <b>${this.esc(plan.periodDays)}</b> дн.\n\n` +
                            `Далее: получить конфиг — <code>/config</code>`);
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
                    await this.sendConfigMessage(ctx, user);
                }
                catch (error) {
                    this.logger.error('Error handling /config command:', error);
                    await this.replyHtml(ctx, `❌ <b>Не удалось получить конфиг</b>\n\n` +
                        `Попробуйте позже или напишите в поддержку: <code>/support</code>`);
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
                        await this.replyHtml(ctx, '❌ Пользователь не найден. Нажмите <code>/start</code> для регистрации.');
                        return;
                    }
                    this.logger.log(`Support mode activated for user: ${telegramId}`);
                    await this.enableSupportMode(ctx, telegramId);
                }
                catch (error) {
                    this.logger.error('Error handling /support command:', error);
                    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
                }
            });
            this.bot.command('help', async (ctx) => {
                try {
                    const helpMessage = `❓ <b>Помощь</b>\n\n` +
                        `<b>1) Подключение</b>\n` +
                        `• Получите конфиг: <code>/config</code>\n` +
                        `• Импортируйте в приложение и включите VPN\n\n` +
                        `<b>2) Рекомендуемые приложения</b>\n` +
                        `• iOS: Shadowrocket / v2rayNG\n` +
                        `• Android: v2rayNG / V2rayTun\n` +
                        `• Windows: v2rayN\n` +
                        `• macOS: ClashX\n\n` +
                        `<b>3) Команды</b>\n` +
                        `• <code>/start</code> — меню\n` +
                        `• <code>/config</code> — конфиг\n` +
                        `• <code>/pay</code> — оплата\n` +
                        `• <code>/status</code> — статус\n` +
                        `• <code>/support</code> — поддержка\n\n` +
                        `Если что-то не работает — напишите в <code>/support</code>.`;
                    await this.replyHtml(ctx, helpMessage);
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
                    const statusEmoji = { NEW: '🆕', ACTIVE: '✅', BLOCKED: '🚫', EXPIRED: '⏰' };
                    const statusLabel = {
                        NEW: 'Без подписки',
                        ACTIVE: 'Активен',
                        BLOCKED: 'Заблокирован',
                        EXPIRED: 'Истёк',
                    };
                    let message = `${statusEmoji[user.status] || 'ℹ️'} <b>Статус</b>: ${this.esc(statusLabel[user.status] || user.status)}\n`;
                    if (user.expiresAt) {
                        const expiresAt = new Date(user.expiresAt);
                        const now = new Date();
                        const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                        if (daysLeft > 0) {
                            message += `\n📅 До: <b>${this.esc(this.fmtDate(expiresAt))}</b>\n`;
                            message += `⏳ Осталось: <b>${this.esc(daysLeft)}</b> дн.\n`;
                        }
                        else {
                            message += `\n⏰ Подписка истекла\n💳 Продлить: <code>/pay</code>\n`;
                        }
                    }
                    else {
                        message += `\n📅 Подписка не активирована\n`;
                        if (!user.userServers || user.userServers.length === 0) {
                            message += `📍 Выберите локацию: <code>/start</code>\n`;
                        }
                    }
                    if (user.userServers && user.userServers.length > 0) {
                        message += `\n🌐 <b>Локация</b>:\n`;
                        user.userServers.forEach((userServer) => {
                            message += `• ${this.esc(userServer.server.name)}\n`;
                        });
                    }
                    else {
                        message += `\n🌐 Локация не выбрана\n📍 Выбрать: <code>/start</code>\n`;
                    }
                    if (user.subscriptions && user.subscriptions.length > 0) {
                        const lastSub = user.subscriptions[0];
                        message +=
                            `\n📦 Последний период: <b>${this.esc(lastSub.periodDays)}</b> дн.\n` +
                                `(${this.esc(this.fmtDate(new Date(lastSub.startsAt)))} – ${this.esc(this.fmtDate(new Date(lastSub.endsAt)))})\n`;
                    }
                    await this.replyHtml(ctx, message);
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
            this.bot.command('info', async (ctx) => {
                try {
                    const siteUrlRaw = this.config.get('PUBLIC_SITE_URL') || '';
                    const siteUrl = siteUrlRaw.replace(/\/+$/, '');
                    const privacyUrl = siteUrl ? `${siteUrl}/privacy` : null;
                    const termsUrl = siteUrl ? `${siteUrl}/terms` : null;
                    const supportEmail = this.config.get('PUBLIC_SUPPORT_EMAIL') || null;
                    const supportTelegram = this.config.get('PUBLIC_SUPPORT_TELEGRAM') || null;
                    const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    let msg = 'ℹ️ <b>Информация</b>\n\n';
                    msg += '• Документы:\n';
                    if (privacyUrl) {
                        msg += `  • <a href="${privacyUrl}">Политика конфиденциальности</a>\n`;
                    }
                    else {
                        msg += '  • Политика конфиденциальности — не настроено\n';
                    }
                    if (termsUrl) {
                        msg += `  • <a href="${termsUrl}">Пользовательское соглашение</a>\n\n`;
                    }
                    else {
                        msg += '  • Пользовательское соглашение — не настроено\n\n';
                    }
                    msg += '• Контакты:\n';
                    if (supportTelegram) {
                        const tgUser = supportTelegram.replace(/^@/, '');
                        msg += `  • Telegram: <a href="tg://resolve?domain=${escape(tgUser)}">${escape(supportTelegram)}</a>\n`;
                    }
                    if (supportEmail) {
                        msg += `  • Email: <a href="mailto:${escape(supportEmail)}">${escape(supportEmail)}</a>\n`;
                    }
                    if (!supportTelegram && !supportEmail)
                        msg += '  • не настроено\n';
                    await ctx.reply(msg, { parse_mode: 'HTML' });
                }
                catch (error) {
                    this.logger.error('Error handling /info command:', error);
                    await ctx.reply('❌ Не удалось загрузить информацию. Попробуйте позже.');
                }
            });
            this.setupMenuHandlers();
            this.bot.catch((err, ctx) => {
                this.logger.error('Bot error:', err);
                ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
            });
            try {
                const activeBot = await this.prisma.botConfig.findFirst({
                    where: { active: true },
                    orderBy: { createdAt: 'desc' },
                    select: { useMiniApp: true },
                });
                const useMiniApp = Boolean(activeBot?.useMiniApp);
                const commands = useMiniApp
                    ? [
                        { command: 'start', description: '🏠 Главное меню' },
                        { command: 'info', description: 'ℹ️ Информация и документы' },
                        { command: 'help', description: '❓ Помощь и инструкции' },
                        { command: 'support', description: '💬 Поддержка' },
                        { command: 'cancel', description: '❌ Отменить режим поддержки' },
                    ]
                    : [
                        { command: 'start', description: '🏠 Главное меню' },
                        { command: 'config', description: '📥 Получить конфигурацию VPN' },
                        { command: 'pay', description: '💳 Оплатить подписку' },
                        { command: 'status', description: '📊 Статус подписки' },
                        { command: 'info', description: 'ℹ️ Информация и документы' },
                        { command: 'support', description: '💬 Поддержка' },
                        { command: 'help', description: '❓ Помощь и инструкции' },
                        { command: 'cancel', description: '❌ Отменить режим поддержки' },
                    ];
                await this.bot.telegram.setMyCommands(commands);
                this.logger.log('Bot commands registered successfully');
            }
            catch (error) {
                this.logger.warn('Failed to register bot commands:', error);
            }
            try {
                await this.bot.telegram.deleteWebhook({ drop_pending_updates: true });
            }
            catch (error) {
                this.logger.warn('Failed to delete webhook (can be ignored):', error);
            }
            await this.bot.launch();
            this.isRunning = true;
            try {
                const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
                const json = (await res.json());
                if (json?.ok && json?.result?.username) {
                    this.logger.log(`Telegram bot started: @${json.result.username}`);
                }
                else {
                    this.logger.log('Telegram bot started successfully');
                }
            }
            catch {
                this.logger.log('Telegram bot started successfully');
            }
            process.once('SIGINT', () => this.stopBot());
            process.once('SIGTERM', () => this.stopBot());
        }
        catch (error) {
            this.logger.error('Failed to start bot:', error);
            if (this.pollingLockAcquired) {
                try {
                    await this.prisma.$queryRaw `
            SELECT pg_advisory_unlock(${this.pollingLockKey}) AS unlocked
          `;
                }
                catch {
                }
                this.pollingLockAcquired = false;
            }
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
    esc(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
    fmtDate(d) {
        try {
            return d.toLocaleDateString('ru-RU');
        }
        catch {
            return String(d);
        }
    }
    getTrialDaysFromPlans(plans) {
        const trialPlan = plans?.find((p) => p?.isTrial);
        const n = Number(trialPlan?.periodDays);
        return Number.isFinite(n) && n > 0 ? n : 3;
    }
    async getTrialDaysForUser(userId) {
        try {
            const plans = await this.plansService.list(userId);
            return this.getTrialDaysFromPlans(plans);
        }
        catch {
            return 3;
        }
    }
    async replyHtml(ctx, html, extra) {
        return ctx.reply(html, { parse_mode: 'HTML', disable_web_page_preview: true, ...(extra ?? {}) });
    }
    async editHtml(ctx, html, extra) {
        return ctx.editMessageText(html, { parse_mode: 'HTML', disable_web_page_preview: true, ...(extra ?? {}) });
    }
    planBtnLabel(plan) {
        const name = String(plan?.name ?? 'Тариф');
        const price = plan?.price != null ? `${plan.price}` : '?';
        const cur = String(plan?.currency ?? '');
        const days = plan?.periodDays != null ? `${plan.periodDays}д` : '';
        return `${name} · ${price} ${cur} · ${days}`.trim();
    }
    async sendConfigMessage(ctx, user) {
        if (!user) {
            await this.replyHtml(ctx, '❌ Пользователь не найден. Нажмите <code>/start</code> для регистрации.');
            return;
        }
        if (user.status === 'BLOCKED') {
            await this.replyHtml(ctx, '🚫 <b>Аккаунт заблокирован</b>\n\nСвяжитесь с поддержкой: <code>/support</code>');
            return;
        }
        if (user.status === 'EXPIRED') {
            await this.replyHtml(ctx, '⏰ <b>Подписка истекла</b>\n\nПродлить: <code>/pay</code>');
            return;
        }
        const configResult = await this.usersService.getConfig(user.id);
        if (!configResult?.configs?.length) {
            await this.replyHtml(ctx, `📍 <b>Локация не выбрана</b>\n\n` +
                `Откройте меню и выберите локацию: <code>/start</code>`);
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
                caption: `📱 <b>QR для подключения</b>\n` +
                    `<i>${this.esc(serverName)}</i>\n\n` +
                    `Отсканируйте QR в вашем VPN‑клиенте.`,
                parse_mode: 'HTML',
            });
        }
        catch (qrError) {
            this.logger.error('Failed to generate QR code:', qrError);
            await this.replyHtml(ctx, '⚠️ Не удалось сгенерировать QR‑код. Ниже доступна ссылка конфигурации.');
        }
        await this.replyHtml(ctx, `📥 <b>Конфигурация</b> <i>(${this.esc(serverName)})</i>\n\n` +
            `<pre>${this.esc(configUrl)}</pre>\n` +
            `Скопируйте ссылку и импортируйте в приложение.`);
    }
    async enableSupportMode(ctx, telegramId) {
        this.supportModeUsers.set(telegramId, true);
        await this.replyHtml(ctx, `💬 <b>Поддержка</b>\n\n` +
            `Напишите ваш вопрос одним сообщением — мы ответим как можно скорее.\n\n` +
            `Выйти из режима: <code>/cancel</code> или <code>/start</code>`);
    }
    async buildMainMenuKeyboard(user) {
        const { Markup } = await Promise.resolve().then(() => require('telegraf'));
        const miniAppUrl = this.config.get('TELEGRAM_MINI_APP_URL');
        const activeBot = await this.prisma.botConfig.findFirst({
            where: { active: true },
            orderBy: { createdAt: 'desc' },
            select: { useMiniApp: true },
        });
        const hydratedUser = user?.id
            ? await this.prisma.vpnUser.findUnique({
                where: { id: user.id },
                include: {
                    userServers: { where: { isActive: true } },
                },
            })
            : user;
        const hasActiveLocation = Boolean(hydratedUser?.serverId || (hydratedUser?.userServers && hydratedUser.userServers.length > 0));
        const row1 = [];
        const row2 = [];
        if (hasActiveLocation) {
            row1.push(Markup.button.callback('📥 Получить конфиг', 'get_config'));
            row1.push(Markup.button.callback('📊 Статус подписки', 'show_status'));
            row2.push(Markup.button.callback('📍 Выбрать другую локацию', 'back_to_servers'));
            row2.push(Markup.button.callback('💳 Оплатить подписку', 'show_pay'));
        }
        else {
            row1.push(Markup.button.callback('📍 Выбрать локацию', 'back_to_servers'));
            row1.push(Markup.button.callback('💳 Оплатить подписку', 'show_pay'));
        }
        if (activeBot?.useMiniApp && miniAppUrl && miniAppUrl.startsWith('https://')) {
            row2.push(Markup.button.webApp('📱 Открыть мини‑приложение', miniAppUrl));
        }
        return Markup.inlineKeyboard(row2.length > 0 ? [row1, row2] : [row1]);
    }
    async showMainMenu(ctx, user) {
        await this.replyHtml(ctx, `🏠 <b>Главное меню</b>\n<i>Выберите действие ниже</i>`, await this.buildMainMenuKeyboard(user));
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
            await ctx.answerCbQuery();
            await this.sendConfigMessage(ctx, user);
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
                        await this.replyHtml(ctx, `❌ <b>Нет доступных тарифов</b>\n\n` +
                            `Попробуйте позже или напишите в поддержку: <code>/support</code>`);
                        return;
                    }
                    paidPlans = allActivePlans;
                    this.logger.debug(`Using ${paidPlans.length} active plans as fallback`);
                }
                const { Markup } = await Promise.resolve().then(() => require('telegraf'));
                const buttons = paidPlans.map((plan) => [
                    Markup.button.callback(this.planBtnLabel(plan), `select_plan_${plan.id}`),
                ]);
                await ctx.answerCbQuery();
                try {
                    await this.editHtml(ctx, `💳 <b>Оплата подписки</b>\n\nВыберите тариф ниже — подписка активируется автоматически.`, Markup.inlineKeyboard(buttons));
                }
                catch (editError) {
                    await this.replyHtml(ctx, `💳 <b>Оплата подписки</b>\n\nВыберите тариф ниже — подписка активируется автоматически.`, Markup.inlineKeyboard(buttons));
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
                    await ctx.editMessageText('🏠 Главное меню:');
                }
                catch (editError) {
                }
                await this.showMainMenu(ctx, user);
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
                    NEW: '🆕',
                    ACTIVE: '✅',
                    BLOCKED: '🚫',
                    EXPIRED: '⏰',
                };
                let statusText = `\n\n${statusEmoji[user.status] || '❓'} Статус: ${user.status}`;
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
                const userWithActive = await this.prisma.vpnUser.findFirst({
                    where: { telegramId },
                    include: {
                        userServers: { where: { isActive: true } },
                    },
                });
                const menuKeyboard = await this.buildMainMenuKeyboard(userWithActive ?? user);
                await ctx.answerCbQuery();
                try {
                    const { Markup } = await Promise.resolve().then(() => require('telegraf'));
                    await ctx.editMessageText(`🏠 Главное меню:${statusText}`, menuKeyboard);
                }
                catch (editError) {
                    const { Markup } = await Promise.resolve().then(() => require('telegraf'));
                    await ctx.reply(`🏠 Главное меню:${statusText}`, menuKeyboard);
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
                await ctx.answerCbQuery();
                await this.enableSupportMode(ctx, telegramId);
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
                await this.replyHtml(ctx, `✅ <b>Сообщение отправлено</b>\n\n` +
                    `Если хотите добавить детали — отправьте ещё одно сообщение.\n` +
                    `Выйти: <code>/cancel</code> или <code>/start</code>`);
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
            await this.bot.telegram.sendMessage(telegramId, `💬 <b>Ответ поддержки</b>\n\n${this.esc(message)}`, { parse_mode: 'HTML', disable_web_page_preview: true });
            this.logger.log(`Support reply sent successfully to ${telegramId}`);
        }
        catch (error) {
            this.logger.error(`Failed to send support reply to ${telegramId}:`, error);
        }
    }
    async stopBot(releaseLock = true) {
        if (!this.bot) {
            this.isRunning = false;
            if (releaseLock && this.pollingLockAcquired) {
                try {
                    await this.prisma.$queryRaw `
            SELECT pg_advisory_unlock(${this.pollingLockKey}) AS unlocked
          `;
                }
                catch {
                }
                this.pollingLockAcquired = false;
            }
            return;
        }
        try {
            if (this.isRunning) {
                await this.bot.stop();
            }
            this.isRunning = false;
            this.bot = null;
            this.tokenInUse = null;
            if (releaseLock && this.pollingLockAcquired) {
                try {
                    await this.prisma.$queryRaw `
            SELECT pg_advisory_unlock(${this.pollingLockKey}) AS unlocked
          `;
                }
                catch {
                }
                this.pollingLockAcquired = false;
            }
            this.logger.log('Telegram bot stopped');
        }
        catch (error) {
            this.logger.error('Error stopping bot:', error);
            this.isRunning = false;
            this.bot = null;
            this.tokenInUse = null;
            if (releaseLock && this.pollingLockAcquired) {
                try {
                    await this.prisma.$queryRaw `
            SELECT pg_advisory_unlock(${this.pollingLockKey}) AS unlocked
          `;
                }
                catch {
                }
                this.pollingLockAcquired = false;
            }
        }
    }
    async restartBot() {
        if (this.isStarting) {
            this.logger.log('Restart requested while bot is starting, waiting for startup to finish...');
            const deadline = Date.now() + 15000;
            while (this.isStarting && Date.now() < deadline) {
                await new Promise((r) => setTimeout(r, 300));
            }
            if (this.isStarting) {
                this.logger.warn('Startup did not finish in time, forcing restart');
            }
        }
        this.logger.log('Restarting bot...');
        await this.stopBot();
        await new Promise((resolve) => setTimeout(resolve, 1000));
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