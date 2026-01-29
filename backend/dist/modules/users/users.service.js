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
function buildReadablePanelEmail(name, uuid, serverIdPrefix, telegramId) {
    const sanitized = name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-zа-яё0-9-]/gi, '')
        .slice(0, 24);
    const namePart = sanitized || uuid.slice(0, 8);
    const suffix = telegramId != null && telegramId !== '' ? telegramId : uuid.slice(-6);
    return `${namePart}-${suffix}@vpn-${serverIdPrefix}`;
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
        const panelEmail = buildReadablePanelEmail(dto.name, uuid, dto.serverId.slice(0, 8), dto.telegramId);
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
        if (server.panelBaseUrl && server.panelUsername && server.panelPasswordEnc && server.panelInboundId != null) {
            try {
                const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
                const panelPassword = secret_box_1.SecretBox.decrypt(server.panelPasswordEnc, secret);
                const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
                if (auth.cookie || auth.token) {
                    await this.xui.addClient(server.panelBaseUrl, auth, server.panelInboundId, {
                        id: uuid,
                        email: panelEmail,
                        flow: server.security === 'REALITY' ? 'xtls-rprx-vision' : '',
                        expiryTime: trialEndsAt ? trialEndsAt.getTime() : 0,
                    });
                }
            }
            catch (e) {
                this.logger.warn(`create: panel addClient failed — ${e?.message ?? e}`);
            }
        }
        await this.prisma.userServer.create({
            data: { vpnUserId: user.id, serverId: dto.serverId, panelEmail, isActive: true },
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
        if (dto.expiresAt !== undefined)
            updates.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
        if (dto.serverId !== undefined) {
            updates.server = dto.serverId ? { connect: { id: dto.serverId } } : { disconnect: true };
        }
        await this.prisma.vpnUser.update({ where: { id }, data: updates });
        const activeUserServer = user.userServers.find((us) => us.isActive);
        const server = activeUserServer?.server ?? user.server;
        if (server?.panelBaseUrl && server.panelUsername && server.panelPasswordEnc && server.panelInboundId != null) {
            const email = activeUserServer?.panelEmail ?? user.panelEmail;
            if (email) {
                try {
                    const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
                    const panelPassword = secret_box_1.SecretBox.decrypt(server.panelPasswordEnc, secret);
                    const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
                    if ((auth.cookie || auth.token) && dto.expiresAt !== undefined) {
                        const expiryTime = dto.expiresAt ? new Date(dto.expiresAt).getTime() : 0;
                        await this.xui.updateClient(server.panelBaseUrl, auth, server.panelInboundId, email, { expiryTime });
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
    async getTraffic(userId) {
        const user = await this.prisma.vpnUser.findUnique({
            where: { id: userId },
            include: {
                userServers: { where: { active: true, isActive: true }, include: { server: true } },
                server: true,
            },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const trafficData = [];
        const activeUs = user.userServers?.find((us) => us.isActive);
        if (activeUs) {
            const server = activeUs.server;
            if (server.panelBaseUrl && server.panelUsername && server.panelPasswordEnc && server.panelInboundId != null) {
                try {
                    const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
                    const panelPassword = secret_box_1.SecretBox.decrypt(server.panelPasswordEnc, secret);
                    const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
                    if (auth.cookie || auth.token) {
                        const traffic = await this.xui.getClientTraffic(server.panelBaseUrl, auth, server.panelInboundId, activeUs.panelEmail);
                        trafficData.push({
                            serverId: server.id,
                            serverName: server.name,
                            panelEmail: activeUs.panelEmail,
                            up: traffic.up,
                            down: traffic.down,
                            total: traffic.total,
                            reset: traffic.reset,
                            lastOnline: traffic.lastOnline,
                        });
                    }
                }
                catch (e) {
                    this.logger.warn(`getTraffic(userId=${userId}): ${e?.message ?? e}`);
                }
            }
        }
        else if (user.panelEmail && user.server) {
            const server = user.server;
            if (server.panelBaseUrl && server.panelUsername && server.panelPasswordEnc && server.panelInboundId != null) {
                try {
                    const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
                    const panelPassword = secret_box_1.SecretBox.decrypt(server.panelPasswordEnc, secret);
                    const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
                    if (auth.cookie || auth.token) {
                        const traffic = await this.xui.getClientTraffic(server.panelBaseUrl, auth, server.panelInboundId, user.panelEmail);
                        trafficData.push({
                            serverId: server.id,
                            serverName: server.name,
                            panelEmail: user.panelEmail,
                            up: traffic.up,
                            down: traffic.down,
                            total: traffic.total,
                            reset: traffic.reset,
                            lastOnline: traffic.lastOnline,
                        });
                    }
                }
                catch (e) {
                    this.logger.warn(`getTraffic(userId=${userId}, legacy): ${e?.message ?? e}`);
                }
            }
        }
        return { traffic: trafficData };
    }
    async resetTraffic(userId) {
        const user = await this.prisma.vpnUser.findUnique({
            where: { id: userId },
            include: {
                userServers: { where: { active: true, isActive: true }, include: { server: true } },
                server: true,
            },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const activeUs = user.userServers?.find((us) => us.isActive);
        const server = activeUs?.server ?? user.server;
        const email = activeUs?.panelEmail ?? user.panelEmail;
        if (!server?.panelBaseUrl || !server.panelUsername || !server.panelPasswordEnc || server.panelInboundId == null || !email) {
            throw new common_1.BadRequestException('No panel client to reset');
        }
        const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
        const panelPassword = secret_box_1.SecretBox.decrypt(server.panelPasswordEnc, secret);
        const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
        if (!auth.cookie && !auth.token)
            throw new common_1.BadRequestException('Panel login failed');
        await this.xui.resetClientTraffic(server.panelBaseUrl, auth, server.panelInboundId, email);
        return { ok: true };
    }
    async addServer(userId, serverId) {
        const server = await this.prisma.vpnServer.findUnique({ where: { id: serverId } });
        if (!server || !server.active)
            throw new common_1.NotFoundException('Server not found');
        const user = await this.prisma.vpnUser.findUnique({ where: { id: userId }, include: { userServers: true } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const count = await this.prisma.vpnServer.findUnique({
            where: { id: serverId },
            include: { _count: { select: { userServers: true } } },
        }).then((s) => s?._count?.userServers ?? 0);
        if (server.maxUsers > 0 && count >= server.maxUsers)
            throw new common_1.BadRequestException('Server is full');
        const panelEmail = buildReadablePanelEmail(user.name, user.uuid, serverId.slice(0, 8), user.telegramId);
        await this.prisma.userServer.create({
            data: { vpnUserId: userId, serverId, panelEmail, active: true, isActive: false },
        });
        return this.get(userId);
    }
    async addServerAndTrial(userId, serverId, trialDays) {
        const server = await this.prisma.vpnServer.findUnique({ where: { id: serverId } });
        if (!server || !server.active)
            throw new common_1.NotFoundException('Server not found');
        const user = await this.prisma.vpnUser.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const count = await this.prisma.vpnServer.findUnique({
            where: { id: serverId },
            include: { _count: { select: { userServers: true } } },
        }).then((s) => s?._count?.userServers ?? 0);
        if (server.maxUsers > 0 && count >= server.maxUsers)
            throw new common_1.BadRequestException('Server is full');
        const existing = await this.prisma.userServer.findUnique({
            where: { vpnUserId_serverId: { vpnUserId: userId, serverId } },
        });
        let trialCreated = false;
        if (existing) {
            await this.activateServer(userId, serverId);
            return { updated: await this.get(userId), trialCreated: false };
        }
        const panelEmail = buildReadablePanelEmail(user.name, user.uuid, serverId.slice(0, 8), user.telegramId);
        const now = new Date();
        const endsAt = new Date(now);
        endsAt.setUTCDate(endsAt.getUTCDate() + trialDays);
        if (server.panelBaseUrl && server.panelUsername && server.panelPasswordEnc && server.panelInboundId != null) {
            const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
            const panelPassword = secret_box_1.SecretBox.decrypt(server.panelPasswordEnc, secret);
            const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
            if (auth.cookie || auth.token) {
                await this.xui.addClient(server.panelBaseUrl, auth, server.panelInboundId, {
                    id: user.uuid,
                    email: panelEmail,
                    flow: server.security === 'REALITY' ? 'xtls-rprx-vision' : '',
                    expiryTime: endsAt.getTime(),
                });
            }
        }
        await this.prisma.$transaction(async (tx) => {
            await tx.userServer.updateMany({ where: { vpnUserId: userId }, data: { isActive: false } });
            await tx.userServer.create({
                data: { vpnUserId: userId, serverId, panelEmail, active: true, isActive: true },
            });
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
        trialCreated = true;
        return { updated: await this.get(userId), trialCreated };
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
                        await this.xui.deleteClient(previousActive.server.panelBaseUrl, auth, previousActive.server.panelInboundId, previousActive.panelEmail);
                    }
                }
                catch (e) {
                    this.logger.warn(`activateServer: delete previous client failed — ${e?.message ?? e}`);
                }
            }
            if (us.server?.panelBaseUrl && us.server.panelUsername && us.server.panelPasswordEnc && us.server.panelInboundId != null) {
                const s = us.server;
                const baseUrl = s.panelBaseUrl;
                const username = s.panelUsername;
                const passwordEnc = s.panelPasswordEnc;
                const inboundId = s.panelInboundId;
                const expiryTime = user.expiresAt ? new Date(user.expiresAt).getTime() : 0;
                try {
                    const panelPassword = secret_box_1.SecretBox.decrypt(passwordEnc, secret);
                    const auth = await this.xui.login(baseUrl, username, panelPassword);
                    if (auth.cookie || auth.token) {
                        try {
                            await this.xui.addClient(baseUrl, auth, inboundId, {
                                id: user.uuid,
                                email: us.panelEmail,
                                flow: s.security === 'REALITY' ? 'xtls-rprx-vision' : '',
                                expiryTime: expiryTime || undefined,
                                enable: true,
                            });
                        }
                        catch (addErr) {
                            if (addErr instanceof common_1.BadRequestException && addErr.message?.includes('already exists')) {
                                await this.xui.updateClient(baseUrl, auth, inboundId, us.panelEmail, { enable: true });
                            }
                            else {
                                throw addErr;
                            }
                        }
                    }
                }
                catch (e) {
                    this.logger.warn(`activateServer: add/enable new client failed — ${e?.message ?? e}`);
                }
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
                const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
                const panelPassword = secret_box_1.SecretBox.decrypt(server.panelPasswordEnc, secret);
                const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
                if (auth.cookie || auth.token)
                    await this.xui.deleteClient(server.panelBaseUrl, auth, server.panelInboundId, us.panelEmail);
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