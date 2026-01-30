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
var UsersService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto_1 = require("crypto");
const prisma_service_1 = require("../prisma/prisma.service");
const xui_service_1 = require("../xui/xui.service");
const secret_box_1 = require("../../common/crypto/secret-box");
function buildPanelEmail(uuid, serverId) {
    const prefix = serverId.slice(0, 8);
    return `${uuid}@vpn-${prefix}`;
}
function addDaysUtc(date, days) {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
}
let UsersService = UsersService_1 = class UsersService {
    prisma;
    xui;
    config;
    logger = new common_1.Logger(UsersService_1.name);
    constructor(prisma, xui, config) {
        this.prisma = prisma;
        this.xui = xui;
        this.config = config;
    }
    async ensurePanelClient(server, userUuid, panelEmail, options) {
        if (!server.panelBaseUrl || !server.panelUsername || !server.panelPasswordEnc || server.panelInboundId == null)
            return;
        const secret = this.config.get('PANEL_CRED_SECRET');
        if (!secret)
            return;
        try {
            const panelPassword = secret_box_1.SecretBox.decrypt(server.panelPasswordEnc, secret);
            const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
            if (!auth.cookie && !auth.token)
                return;
            const expiryTime = options?.expiryTime ?? 0;
            try {
                await this.xui.addClient(server.panelBaseUrl, auth, server.panelInboundId, {
                    id: userUuid,
                    email: panelEmail,
                    flow: server.security === 'REALITY' ? 'xtls-rprx-vision' : '',
                    expiryTime: expiryTime > 0 ? expiryTime : undefined,
                    enable: options?.enable,
                });
            }
            catch (addErr) {
                if (addErr instanceof common_1.BadRequestException && addErr.message?.includes('already exists')) {
                    await this.xui.updateClient(server.panelBaseUrl, auth, server.panelInboundId, panelEmail, {
                        ...(options?.enable !== undefined && { enable: options.enable }),
                        ...(options?.expiryTime !== undefined && { expiryTime: options.expiryTime }),
                    });
                }
                else {
                    throw addErr;
                }
            }
        }
        catch (e) {
            this.logger.warn(`ensurePanelClient: ${e?.message ?? e}`);
        }
    }
    async attachUserToServer(userId, serverId, options) {
        const user = await this.prisma.vpnUser.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const server = await this.prisma.vpnServer.findUnique({ where: { id: serverId } });
        if (!server || !server.active)
            throw new common_1.NotFoundException('Server not found');
        const count = await this.prisma.vpnServer.findUnique({
            where: { id: serverId },
            include: { _count: { select: { userServers: true } } },
        }).then((s) => s?._count?.userServers ?? 0);
        if (server.maxUsers > 0 && count >= server.maxUsers)
            throw new common_1.BadRequestException('Server is full');
        const panelEmail = buildPanelEmail(user.uuid, serverId);
        if (options.addToPanel) {
            await this.ensurePanelClient(server, user.uuid, panelEmail, {
                expiryTime: options.expiryTime,
                enable: options.isActive ? true : undefined,
            });
        }
        await this.prisma.userServer.create({
            data: { vpnUserId: userId, serverId, panelEmail, active: true, isActive: options.isActive },
        });
    }
    async syncExpiresAtWithActiveSubscription(userId) {
        const [user, sub] = await Promise.all([
            this.prisma.vpnUser.findUnique({ where: { id: userId }, select: { expiresAt: true, status: true } }),
            this.prisma.subscription.findFirst({
                where: { vpnUserId: userId, active: true },
                orderBy: { endsAt: 'desc' },
                select: { endsAt: true, periodDays: true },
            }),
        ]);
        if (!user || !sub)
            return null;
        if (user.status === 'BLOCKED')
            return { endsAt: sub.endsAt, periodDays: sub.periodDays };
        const now = new Date();
        const nextStatus = sub.endsAt.getTime() < now.getTime() ? 'EXPIRED' : 'ACTIVE';
        const shouldUpdate = !user.expiresAt || user.expiresAt.getTime() !== sub.endsAt.getTime() || user.status !== nextStatus;
        if (shouldUpdate) {
            await this.prisma.vpnUser.update({
                where: { id: userId },
                data: { expiresAt: sub.endsAt, status: nextStatus },
            });
        }
        return { endsAt: sub.endsAt, periodDays: sub.periodDays };
    }
    async refreshExpiredStatuses() {
        const now = new Date();
        await this.prisma.vpnUser.updateMany({
            where: { status: 'ACTIVE', expiresAt: { not: null, lt: now } },
            data: { status: 'EXPIRED' },
        });
    }
    async list() {
        await this.refreshExpiredStatuses();
        return this.prisma.vpnUser.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                server: true,
                userServers: { include: { server: true } },
            },
        });
    }
    async get(id) {
        await this.refreshExpiredStatuses();
        const user = await this.prisma.vpnUser.findUnique({
            where: { id },
            include: {
                server: true,
                userServers: { include: { server: true } },
                subscriptions: { where: { active: true }, orderBy: { endsAt: 'desc' } },
                payments: { orderBy: { createdAt: 'desc' }, take: 10 },
            },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        return user;
    }
    async create(dto) {
        const uuid = (0, crypto_1.randomUUID)();
        const server = await this.prisma.vpnServer.findUnique({ where: { id: dto.serverId } });
        if (!server)
            throw new common_1.NotFoundException('Server not found');
        const panelEmail = buildPanelEmail(uuid, dto.serverId);
        let trialEndsAt = null;
        if (dto.trialDays) {
            const t = new Date();
            trialEndsAt = new Date(t);
            trialEndsAt.setUTCDate(trialEndsAt.getUTCDate() + dto.trialDays);
        }
        const user = await this.prisma.vpnUser.create({
            data: {
                name: dto.name,
                telegramId: dto.telegramId ?? null,
                uuid,
                panelEmail,
                status: 'NEW',
                serverId: dto.serverId,
            },
            include: { server: true, userServers: { include: { server: true } } },
        });
        await this.attachUserToServer(user.id, dto.serverId, {
            isActive: true,
            addToPanel: true,
            expiryTime: trialEndsAt ? trialEndsAt.getTime() : undefined,
        });
        if (dto.trialDays && trialEndsAt) {
            const now = new Date();
            await this.prisma.subscription.create({
                data: {
                    vpnUserId: user.id,
                    periodDays: dto.trialDays,
                    startsAt: now,
                    endsAt: trialEndsAt,
                    active: true,
                },
            });
            await this.prisma.vpnUser.update({
                where: { id: user.id },
                data: { expiresAt: trialEndsAt, status: 'ACTIVE' },
            });
        }
        return this.get(user.id);
    }
    async update(id, dto) {
        const user = await this.prisma.vpnUser.findUnique({
            where: { id },
            include: { server: true, userServers: { where: { isActive: true }, include: { server: true } } },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const updates = {};
        if (dto.name != null)
            updates.name = dto.name;
        if (dto.telegramId !== undefined)
            updates.telegramId = dto.telegramId;
        if (dto.status != null)
            updates.status = dto.status;
        const now = new Date();
        const expiresAtFromTrialDays = dto.trialDays != null ? addDaysUtc(now, Number(dto.trialDays)) : null;
        const effectiveExpiresAt = dto.trialDays != null ? expiresAtFromTrialDays : (dto.expiresAt !== undefined ? (dto.expiresAt ? new Date(dto.expiresAt) : null) : undefined);
        if (effectiveExpiresAt !== undefined)
            updates.expiresAt = effectiveExpiresAt;
        if (dto.serverId !== undefined) {
            updates.server = dto.serverId ? { connect: { id: dto.serverId } } : { disconnect: true };
        }
        if (dto.trialDays != null) {
            const endsAt = expiresAtFromTrialDays;
            const periodDays = Number(dto.trialDays);
            const nextStatus = (dto.status ?? user.status) === 'BLOCKED'
                ? 'BLOCKED'
                : endsAt.getTime() < now.getTime()
                    ? 'EXPIRED'
                    : 'ACTIVE';
            await this.prisma.$transaction(async (tx) => {
                await tx.subscription.updateMany({ where: { vpnUserId: id, active: true }, data: { active: false } });
                await tx.subscription.create({
                    data: {
                        vpnUserId: id,
                        paymentId: null,
                        periodDays,
                        startsAt: now,
                        endsAt,
                        active: true,
                    },
                });
                await tx.vpnUser.update({
                    where: { id },
                    data: {
                        ...updates,
                        status: dto.status ?? nextStatus,
                    },
                });
            });
        }
        else {
            await this.prisma.vpnUser.update({ where: { id }, data: updates });
        }
        const activeUserServer = user.userServers.find((us) => us.isActive);
        const server = activeUserServer?.server ?? user.server;
        if (server?.panelBaseUrl && server.panelUsername && server.panelPasswordEnc && server.panelInboundId != null) {
            const email = activeUserServer?.panelEmail ?? user.panelEmail;
            if (email) {
                try {
                    const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
                    const panelPassword = secret_box_1.SecretBox.decrypt(server.panelPasswordEnc, secret);
                    const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
                    if (auth.cookie || auth.token) {
                        const expiryTime = effectiveExpiresAt === undefined
                            ? undefined
                            : effectiveExpiresAt
                                ? effectiveExpiresAt.getTime()
                                : 0;
                        if (expiryTime !== undefined) {
                            await this.xui.updateClient(server.panelBaseUrl, auth, server.panelInboundId, email, { expiryTime });
                        }
                    }
                }
                catch (e) {
                    this.logger.warn(`update: panel sync failed — ${e?.message ?? e}`);
                }
            }
        }
        return this.get(id);
    }
    async remove(id) {
        const user = await this.get(id);
        const list = [];
        if (user.userServers?.length) {
            for (const us of user.userServers)
                list.push({ server: us.server, panelEmail: us.panelEmail });
        }
        else if (user.server && user.panelEmail) {
            list.push({ server: user.server, panelEmail: user.panelEmail });
        }
        for (const { server: s, panelEmail: email } of list) {
            if (!s?.panelBaseUrl || !s.panelUsername || !s.panelPasswordEnc || s.panelInboundId == null || !email)
                continue;
            try {
                const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
                const panelPassword = secret_box_1.SecretBox.decrypt(s.panelPasswordEnc, secret);
                const auth = await this.xui.login(s.panelBaseUrl, s.panelUsername, panelPassword);
                if (auth.cookie || auth.token)
                    await this.xui.deleteClient(s.panelBaseUrl, auth, s.panelInboundId, email);
            }
            catch (e) {
                this.logger.warn(`remove: panel deleteClient failed — ${e?.message ?? e}`);
            }
        }
        await this.prisma.vpnUser.delete({ where: { id } });
        return { ok: true };
    }
    async createFromTelegram(telegramId, name) {
        const uuid = (0, crypto_1.randomUUID)();
        const panelEmail = `${uuid}@vpn`;
        try {
            const user = await this.prisma.vpnUser.create({
                data: {
                    name,
                    telegramId,
                    uuid,
                    panelEmail,
                    status: 'NEW',
                },
            });
            return user;
        }
        catch (e) {
            if (e?.code === 'P2002') {
                const existing = await this.prisma.vpnUser.findFirst({ where: { telegramId } });
                if (existing)
                    return existing;
            }
            throw e;
        }
    }
    buildVlessUrl(server, uuid, sni, path) {
        const params = new URLSearchParams();
        params.set('type', server.transport === 'WS' ? 'ws' : 'tcp');
        params.set('security', (server.security ?? 'none').toLowerCase());
        params.set('encryption', 'none');
        if (server.security === 'REALITY') {
            params.set('flow', 'xtls-rprx-vision');
            params.set('pbk', server.publicKey ?? '');
            params.set('sid', server.shortId ?? '');
            params.set('sni', sni ?? '');
            params.set('fp', 'chrome');
        }
        else if (server.security === 'TLS' && sni) {
            params.set('sni', sni);
        }
        if (server.transport === 'WS' && path)
            params.set('path', path);
        const hash = encodeURIComponent(server.name ?? 'VPN');
        return `vless://${uuid}@${server.host}:${server.port}?${params.toString()}#${hash}`;
    }
    async getConfig(userId) {
        const user = await this.prisma.vpnUser.findUnique({
            where: { id: userId },
            include: {
                userServers: { where: { active: true, isActive: true }, include: { server: true } },
                server: true,
            },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const configs = [];
        const activeUs = user.userServers?.find((us) => us.isActive);
        if (activeUs) {
            const s = activeUs.server;
            const url = this.buildVlessUrl(s, user.uuid, s.sni ?? null, s.path ?? null);
            configs.push({ url, serverName: s.name });
        }
        else if (user.server) {
            const s = user.server;
            const url = this.buildVlessUrl(s, user.uuid, s.sni ?? null, s.path ?? null);
            configs.push({ url, serverName: s.name });
        }
        return { configs };
    }
    async addServer(userId, serverId) {
        await this.attachUserToServer(userId, serverId, { isActive: false, addToPanel: false });
        return this.get(userId);
    }
    async addServerAndTrial(userId, serverId, trialDays) {
        const user = await this.prisma.vpnUser.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const existing = await this.prisma.userServer.findUnique({
            where: { vpnUserId_serverId: { vpnUserId: userId, serverId } },
        });
        if (existing) {
            await this.syncExpiresAtWithActiveSubscription(userId);
            await this.activateServer(userId, serverId);
            return { updated: await this.get(userId), trialCreated: false };
        }
        const now = new Date();
        const activeSub = await this.prisma.subscription.findFirst({
            where: { vpnUserId: userId, active: true },
            orderBy: { endsAt: 'desc' },
            select: { endsAt: true },
        });
        if (activeSub && activeSub.endsAt.getTime() > now.getTime()) {
            await this.prisma.$transaction(async (tx) => {
                await tx.userServer.updateMany({ where: { vpnUserId: userId }, data: { isActive: false } });
            });
            await this.attachUserToServer(userId, serverId, {
                isActive: true,
                addToPanel: true,
                expiryTime: activeSub.endsAt.getTime(),
            });
            await this.syncExpiresAtWithActiveSubscription(userId);
            return { updated: await this.get(userId), trialCreated: false };
        }
        const endsAt = new Date(now);
        endsAt.setUTCDate(endsAt.getUTCDate() + trialDays);
        await this.prisma.$transaction(async (tx) => {
            await tx.userServer.updateMany({ where: { vpnUserId: userId }, data: { isActive: false } });
        });
        await this.attachUserToServer(userId, serverId, {
            isActive: true,
            addToPanel: true,
            expiryTime: endsAt.getTime(),
        });
        await this.prisma.$transaction(async (tx) => {
            await tx.subscription.updateMany({ where: { vpnUserId: userId, active: true }, data: { active: false } });
            await tx.subscription.create({
                data: { vpnUserId: userId, periodDays: trialDays, startsAt: now, endsAt, active: true },
            });
            await tx.vpnUser.update({
                where: { id: userId },
                data: {
                    expiresAt: endsAt,
                    status: user.status === 'NEW' ? 'ACTIVE' : user.status,
                },
            });
        });
        return { updated: await this.get(userId), trialCreated: true };
    }
    async activateServer(userId, serverId) {
        const [us, previousActive, user] = await Promise.all([
            this.prisma.userServer.findUnique({
                where: { vpnUserId_serverId: { vpnUserId: userId, serverId } },
                include: { server: true },
            }),
            this.prisma.userServer.findFirst({
                where: { vpnUserId: userId, isActive: true },
                include: { server: true },
            }),
            this.prisma.vpnUser.findUnique({ where: { id: userId } }),
        ]);
        if (!us)
            throw new common_1.NotFoundException('User server not found');
        if (!user)
            throw new common_1.NotFoundException('User not found');
        await this.syncExpiresAtWithActiveSubscription(userId);
        await this.prisma.$transaction([
            this.prisma.userServer.updateMany({ where: { vpnUserId: userId }, data: { isActive: false } }),
            this.prisma.userServer.update({ where: { id: us.id }, data: { isActive: true } }),
        ]);
        const secret = this.config.get('PANEL_CRED_SECRET');
        if (secret) {
            if (previousActive && previousActive.serverId !== serverId && previousActive.server?.panelBaseUrl && previousActive.server.panelUsername && previousActive.server.panelPasswordEnc && previousActive.server.panelInboundId != null) {
                try {
                    const panelPassword = secret_box_1.SecretBox.decrypt(previousActive.server.panelPasswordEnc, secret);
                    const auth = await this.xui.login(previousActive.server.panelBaseUrl, previousActive.server.panelUsername, panelPassword);
                    if (auth.cookie || auth.token) {
                        const emailForPanel = buildPanelEmail(user.uuid, previousActive.server.id);
                        await this.xui.deleteClient(previousActive.server.panelBaseUrl, auth, previousActive.server.panelInboundId, emailForPanel);
                    }
                }
                catch (e) {
                    this.logger.warn(`activateServer: delete previous client failed — ${e?.message ?? e}`);
                }
            }
            if (us.server) {
                const expiryTime = user.expiresAt ? new Date(user.expiresAt).getTime() : 0;
                const emailForPanel = buildPanelEmail(user.uuid, us.server.id);
                await this.ensurePanelClient(us.server, user.uuid, emailForPanel, { expiryTime, enable: true });
            }
        }
        return this.get(userId);
    }
    async removeServer(userId, serverId) {
        const us = await this.prisma.userServer.findUnique({
            where: { vpnUserId_serverId: { vpnUserId: userId, serverId } },
            include: { server: true },
        });
        if (!us)
            throw new common_1.NotFoundException('User server not found');
        const server = us.server;
        if (server.panelBaseUrl && server.panelUsername && server.panelPasswordEnc && server.panelInboundId != null) {
            try {
                const user = await this.prisma.vpnUser.findUnique({ where: { id: userId }, select: { uuid: true } });
                if (user) {
                    const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
                    const panelPassword = secret_box_1.SecretBox.decrypt(server.panelPasswordEnc, secret);
                    const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
                    if (auth.cookie || auth.token) {
                        const emailForPanel = buildPanelEmail(user.uuid, server.id);
                        await this.xui.deleteClient(server.panelBaseUrl, auth, server.panelInboundId, emailForPanel);
                    }
                }
            }
            catch (e) {
                this.logger.warn(`removeServer: panel deleteClient failed — ${e?.message ?? e}`);
            }
        }
        await this.prisma.userServer.delete({ where: { id: us.id } });
        return this.get(userId);
    }
    async expireUsersByCron() {
        const now = new Date();
        const users = await this.prisma.vpnUser.findMany({
            where: { status: 'ACTIVE', expiresAt: { not: null, lt: now } },
            include: { userServers: { where: { isActive: true }, include: { server: true } }, server: true },
        });
        for (const user of users) {
            await this.prisma.vpnUser.update({ where: { id: user.id }, data: { status: 'EXPIRED' } });
            const activeUs = user.userServers.find((us) => us.isActive);
            const server = activeUs?.server ?? user.server;
            if (server?.panelBaseUrl && server.panelUsername && server.panelPasswordEnc && server.panelInboundId != null) {
                const email = activeUs?.panelEmail ?? user.panelEmail;
                if (email) {
                    try {
                        const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
                        const panelPassword = secret_box_1.SecretBox.decrypt(server.panelPasswordEnc, secret);
                        const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
                        if (auth.cookie || auth.token)
                            await this.xui.deleteClient(server.panelBaseUrl, auth, server.panelInboundId, email);
                    }
                    catch (e) {
                        this.logger.warn(`expireUsersByCron: deleteClient failed for user ${user.id} — ${e?.message ?? e}`);
                    }
                }
            }
        }
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = UsersService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        xui_service_1.XuiService,
        config_1.ConfigService])
], UsersService);
//# sourceMappingURL=users.service.js.map