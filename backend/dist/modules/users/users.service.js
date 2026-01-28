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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const crypto_1 = require("crypto");
const xui_service_1 = require("../xui/xui.service");
const secret_box_1 = require("../../common/crypto/secret-box");
let UsersService = class UsersService {
    prisma;
    xui;
    config;
    constructor(prisma, xui, config) {
        this.prisma = prisma;
        this.xui = xui;
        this.config = config;
    }
    async refreshExpiredStatuses() {
        const now = new Date();
        await this.prisma.vpnUser.updateMany({
            where: {
                status: 'ACTIVE',
                expiresAt: { not: null, lt: now },
            },
            data: { status: 'EXPIRED' },
        });
    }
    async expireUsersByCron() {
        const now = new Date();
        const users = await this.prisma.vpnUser.findMany({
            where: {
                status: 'ACTIVE',
                expiresAt: { not: null, lt: now },
            },
            include: {
                userServers: {
                    where: { active: true, isActive: true },
                    include: { server: true },
                },
                server: true,
            },
        });
        if (!users.length)
            return;
        for (const user of users) {
            const activeUserServer = user.userServers.find((us) => us.isActive);
            if (activeUserServer) {
                const us = activeUserServer;
                const server = us.server;
                if (server.panelBaseUrl &&
                    server.panelUsername &&
                    server.panelPasswordEnc &&
                    server.panelInboundId) {
                    try {
                        const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
                        const panelPassword = secret_box_1.SecretBox.decrypt(server.panelPasswordEnc, secret);
                        const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
                        if (auth.cookie || auth.token) {
                            const flow = server.security === 'REALITY' ? 'xtls-rprx-vision' : '';
                            await this.xui.updateClientByEmail(server.panelBaseUrl, auth, server.panelInboundId, us.panelEmail, {
                                id: user.uuid,
                                enable: false,
                                expiryTime: user.expiresAt ? user.expiresAt.getTime() : 0,
                                flow,
                                tgId: user.telegramId ?? '',
                                subId: user.name,
                                comment: user.name,
                            });
                        }
                    }
                    catch {
                    }
                }
            }
            else if (user.panelEmail && user.server) {
                const server = user.server;
                if (server.panelBaseUrl &&
                    server.panelUsername &&
                    server.panelPasswordEnc &&
                    server.panelInboundId) {
                    try {
                        const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
                        const panelPassword = secret_box_1.SecretBox.decrypt(server.panelPasswordEnc, secret);
                        const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
                        if (auth.cookie || auth.token) {
                            const flow = server.security === 'REALITY' ? 'xtls-rprx-vision' : '';
                            await this.xui.updateClientByEmail(server.panelBaseUrl, auth, server.panelInboundId, user.panelEmail, {
                                id: user.uuid,
                                enable: false,
                                expiryTime: user.expiresAt ? user.expiresAt.getTime() : 0,
                                flow,
                                tgId: user.telegramId ?? '',
                                subId: user.name,
                                comment: user.name,
                            });
                        }
                    }
                    catch {
                    }
                }
            }
        }
        const userIds = users.map((u) => u.id);
        await this.prisma.$transaction(async (tx) => {
            await tx.subscription.updateMany({
                where: { vpnUserId: { in: userIds }, active: true },
                data: { active: false },
            });
            await tx.vpnUser.updateMany({
                where: { id: { in: userIds } },
                data: { status: 'EXPIRED' },
            });
        });
    }
    async list() {
        await this.refreshExpiredStatuses();
        return this.prisma.vpnUser.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                server: true,
                userServers: {
                    where: { active: true },
                    include: { server: true },
                },
            },
        });
    }
    async get(id) {
        await this.refreshExpiredStatuses();
        const user = await this.prisma.vpnUser.findUnique({
            where: { id },
            include: {
                server: true,
                userServers: {
                    include: { server: true },
                },
                subscriptions: { orderBy: { endsAt: 'desc' } },
                payments: { orderBy: { createdAt: 'desc' } },
            },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        return user;
    }
    async create(dto) {
        const server = await this.prisma.vpnServer.findUnique({ where: { id: dto.serverId } });
        if (!server)
            throw new common_1.NotFoundException('Server not found');
        if (!server.panelBaseUrl || !server.panelUsername || !server.panelPasswordEnc || !server.panelInboundId) {
            throw new common_1.BadRequestException('Selected server is not connected to a panel (missing panelBaseUrl/creds/inboundId)');
        }
        const now = new Date();
        const trialDays = dto.trialDays ?? 3;
        const endsAt = new Date(now);
        endsAt.setUTCDate(endsAt.getUTCDate() + trialDays);
        const created = await this.prisma.vpnUser.create({
            data: {
                serverId: dto.serverId,
                name: dto.name,
                telegramId: dto.telegramId ?? null,
                uuid: (0, crypto_1.randomUUID)(),
                status: 'ACTIVE',
                expiresAt: endsAt,
            },
            include: { server: true },
        });
        const panelEmail = this.makePanelEmail(dto.name, created.id, dto.telegramId, dto.serverId);
        await this.prisma.subscription.create({
            data: {
                vpnUserId: created.id,
                periodDays: trialDays,
                startsAt: now,
                endsAt,
                active: true,
            },
        });
        try {
            const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
            const panelPassword = secret_box_1.SecretBox.decrypt(server.panelPasswordEnc, secret);
            const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
            if (!auth.cookie && !auth.token)
                throw new common_1.BadRequestException('Panel login failed');
            const expiryTimeMs = endsAt.getTime();
            const flow = server.security === 'REALITY' ? 'xtls-rprx-vision' : '';
            await this.xui.addClient(server.panelBaseUrl, auth, server.panelInboundId, {
                id: created.uuid,
                email: panelEmail,
                enable: true,
                expiryTime: expiryTimeMs,
                flow,
                tgId: dto.telegramId ?? '',
                subId: dto.name,
                comment: dto.name,
            });
            await this.prisma.userServer.create({
                data: {
                    vpnUserId: created.id,
                    serverId: dto.serverId,
                    panelEmail,
                    active: true,
                    isActive: true,
                },
            });
            const updated = await this.prisma.vpnUser.update({
                where: { id: created.id },
                data: { panelEmail },
                include: { server: true, userServers: { include: { server: true } } },
            });
            return updated;
        }
        catch (e) {
            await this.prisma.userServer.deleteMany({ where: { vpnUserId: created.id } }).catch(() => undefined);
            await this.prisma.subscription.deleteMany({ where: { vpnUserId: created.id } }).catch(() => undefined);
            await this.prisma.vpnUser.delete({ where: { id: created.id } }).catch(() => undefined);
            throw e;
        }
    }
    async createFromTelegram(telegramId, name) {
        const existing = await this.prisma.vpnUser.findFirst({
            where: { telegramId },
        });
        if (existing) {
            return existing;
        }
        return this.prisma.vpnUser.create({
            data: {
                name,
                telegramId,
                uuid: (0, crypto_1.randomUUID)(),
                status: 'ACTIVE',
                expiresAt: null,
                serverId: null,
            },
            include: { server: true, userServers: { include: { server: true } } },
        });
    }
    async addServerAndTrial(userId, serverId, trialDays = 3) {
        const user = await this.prisma.vpnUser.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const server = await this.prisma.vpnServer.findUnique({ where: { id: serverId } });
        if (!server)
            throw new common_1.NotFoundException('Server not found');
        if (!server.panelBaseUrl || !server.panelUsername || !server.panelPasswordEnc || !server.panelInboundId) {
            throw new common_1.BadRequestException('Selected server is not connected to a panel (missing panelBaseUrl/creds/inboundId)');
        }
        const now = new Date();
        const endsAt = new Date(now);
        endsAt.setUTCDate(endsAt.getUTCDate() + trialDays);
        const panelEmail = this.makePanelEmail(user.name, user.id, user.telegramId ?? undefined, serverId);
        await this.prisma.subscription.updateMany({
            where: { vpnUserId: user.id, active: true },
            data: { active: false },
        });
        const activeUserServers = await this.prisma.userServer.findMany({
            where: {
                vpnUserId: user.id,
                isActive: true,
            },
            include: { server: true },
        });
        for (const oldUserServer of activeUserServers) {
            await this.prisma.userServer.update({
                where: { id: oldUserServer.id },
                data: { isActive: false },
            });
            if (oldUserServer.server.panelBaseUrl &&
                oldUserServer.server.panelUsername &&
                oldUserServer.server.panelPasswordEnc &&
                oldUserServer.server.panelInboundId !== null) {
                try {
                    const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
                    const oldPanelPassword = secret_box_1.SecretBox.decrypt(oldUserServer.server.panelPasswordEnc, secret);
                    const oldAuth = await this.xui.login(oldUserServer.server.panelBaseUrl, oldUserServer.server.panelUsername, oldPanelPassword);
                    if (oldAuth.cookie || oldAuth.token) {
                        await this.xui.deleteClientByEmail(oldUserServer.server.panelBaseUrl, oldAuth, oldUserServer.server.panelInboundId, oldUserServer.panelEmail);
                    }
                }
                catch (error) {
                    console.error(`Failed to remove client from old panel ${oldUserServer.server.panelBaseUrl}:`, error);
                }
            }
        }
        await this.prisma.subscription.create({
            data: {
                vpnUserId: user.id,
                periodDays: trialDays,
                startsAt: now,
                endsAt,
                active: true,
            },
        });
        try {
            const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
            const panelPassword = secret_box_1.SecretBox.decrypt(server.panelPasswordEnc, secret);
            const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
            if (!auth.cookie && !auth.token)
                throw new common_1.BadRequestException('Panel login failed');
            const expiryTimeMs = endsAt.getTime();
            const flow = server.security === 'REALITY' ? 'xtls-rprx-vision' : '';
            const existingUserServer = await this.prisma.userServer.findFirst({
                where: {
                    vpnUserId: user.id,
                    serverId,
                },
            });
            if (existingUserServer) {
                await this.prisma.userServer.update({
                    where: { id: existingUserServer.id },
                    data: {
                        isActive: true,
                        active: true,
                        panelEmail,
                    },
                });
                await this.xui.updateClientByEmail(server.panelBaseUrl, auth, server.panelInboundId, panelEmail, {
                    id: user.uuid,
                    enable: true,
                    expiryTime: expiryTimeMs,
                    flow,
                    tgId: user.telegramId ?? '',
                    subId: user.name,
                    comment: user.name,
                });
            }
            else {
                await this.xui.addClient(server.panelBaseUrl, auth, server.panelInboundId, {
                    id: user.uuid,
                    email: panelEmail,
                    enable: true,
                    expiryTime: expiryTimeMs,
                    flow,
                    tgId: user.telegramId ?? '',
                    subId: user.name,
                    comment: user.name,
                });
                await this.prisma.userServer.create({
                    data: {
                        vpnUserId: user.id,
                        serverId,
                        panelEmail,
                        active: true,
                        isActive: true,
                    },
                });
            }
            const updated = await this.prisma.vpnUser.update({
                where: { id: user.id },
                data: {
                    serverId,
                    panelEmail,
                    expiresAt: endsAt,
                },
                include: { server: true, userServers: { include: { server: true } } },
            });
            return updated;
        }
        catch (e) {
            await this.prisma.userServer.deleteMany({ where: { vpnUserId: user.id } }).catch(() => undefined);
            await this.prisma.subscription.deleteMany({ where: { vpnUserId: user.id, active: true } }).catch(() => undefined);
            throw e;
        }
    }
    async getConfig(id) {
        const user = await this.prisma.vpnUser.findUnique({
            where: { id },
            include: {
                userServers: {
                    where: { active: true, isActive: true },
                    include: { server: true },
                },
                server: true,
            },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const userName = user.name || user.telegramId || 'User';
        const configs = [];
        for (const us of user.userServers) {
            const s = us.server;
            const serverName = s.name || s.host || 'Server';
            const tag = encodeURIComponent(`${serverName} - ${userName}`);
            let url;
            if (s.security === 'REALITY') {
                if (!s.sni)
                    continue;
                const params = new URLSearchParams({
                    type: s.transport === 'TCP' ? 'tcp' : 'ws',
                    encryption: 'none',
                    security: 'reality',
                    spx: '/',
                    sni: s.sni,
                    fp: 'random',
                    pbk: s.publicKey,
                    sid: s.shortId,
                    flow: 'xtls-rprx-vision',
                });
                url = `vless://${user.uuid}@${s.host}:${s.port}?${params.toString()}#${tag}`;
            }
            else if (s.security === 'TLS') {
                const params = new URLSearchParams({
                    type: s.transport === 'WS' ? 'ws' : 'tcp',
                    encryption: 'none',
                    security: 'tls',
                    sni: s.sni ?? s.host,
                });
                if (s.transport === 'TCP') {
                    params.set('flow', 'xtls-rprx-vision');
                }
                if (s.transport === 'WS') {
                    if (s.path)
                        params.set('path', s.path);
                    params.set('host', s.host);
                }
                url = `vless://${user.uuid}@${s.host}:${s.port}?${params.toString()}#${tag}`;
            }
            else {
                const params = new URLSearchParams({
                    type: s.transport === 'WS' ? 'ws' : 'tcp',
                    encryption: 'none',
                    security: 'none',
                });
                if (s.transport === 'WS') {
                    if (s.path)
                        params.set('path', s.path);
                    params.set('host', s.host);
                }
                url = `vless://${user.uuid}@${s.host}:${s.port}?${params.toString()}#${tag}`;
            }
            configs.push({ url, serverName });
        }
        if (configs.length === 0 && user.serverId && user.server) {
            const s = user.server;
            const serverName = s.name || s.host || 'Server';
            const tag = encodeURIComponent(`${serverName} - ${userName}`);
            let url;
            if (s.security === 'REALITY') {
                if (!s.sni)
                    throw new common_1.BadRequestException('Server SNI is missing');
                const params = new URLSearchParams({
                    type: s.transport === 'TCP' ? 'tcp' : 'ws',
                    encryption: 'none',
                    security: 'reality',
                    spx: '/',
                    sni: s.sni,
                    fp: 'random',
                    pbk: s.publicKey,
                    sid: s.shortId,
                    flow: 'xtls-rprx-vision',
                });
                url = `vless://${user.uuid}@${s.host}:${s.port}?${params.toString()}#${tag}`;
            }
            else if (s.security === 'TLS') {
                const params = new URLSearchParams({
                    type: s.transport === 'WS' ? 'ws' : 'tcp',
                    encryption: 'none',
                    security: 'tls',
                    sni: s.sni ?? s.host,
                });
                if (s.transport === 'TCP') {
                    params.set('flow', 'xtls-rprx-vision');
                }
                if (s.transport === 'WS') {
                    if (s.path)
                        params.set('path', s.path);
                    params.set('host', s.host);
                }
                url = `vless://${user.uuid}@${s.host}:${s.port}?${params.toString()}#${tag}`;
            }
            else {
                const params = new URLSearchParams({
                    type: s.transport === 'WS' ? 'ws' : 'tcp',
                    encryption: 'none',
                    security: 'none',
                });
                if (s.transport === 'WS') {
                    if (s.path)
                        params.set('path', s.path);
                    params.set('host', s.host);
                }
                url = `vless://${user.uuid}@${s.host}:${s.port}?${params.toString()}#${tag}`;
            }
            configs.push({ url, serverName });
        }
        if (configs.length === 0) {
            throw new common_1.BadRequestException('User has no active servers');
        }
        return { configs };
    }
    makePanelEmail(name, userId, telegramId, serverId) {
        const suffix = userId.slice(-6);
        const base = `${name}`.trim() || 'user';
        const safe = base
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')
            .slice(0, 20);
        const tg = (telegramId ?? '').trim();
        const tgPart = tg ? `tg${tg.slice(0, 10)}-` : '';
        const serverPart = serverId ? `s${serverId.slice(-6)}-` : '';
        const final = `${tgPart}${serverPart}${safe || 'user'}-${suffix}`;
        return final.slice(0, 64);
    }
    async update(id, dto) {
        const existing = await this.prisma.vpnUser.findUnique({
            where: { id },
            include: {
                server: true,
                userServers: {
                    include: { server: true },
                },
            },
        });
        if (!existing)
            throw new common_1.NotFoundException('User not found');
        const nextName = (dto.name ?? existing.name).trim();
        const nextTelegramId = dto.telegramId === undefined ? existing.telegramId : (dto.telegramId ?? '').trim() || null;
        const nextStatus = dto.status ?? existing.status;
        const nextServerId = dto.serverId ?? existing.serverId;
        if (dto.serverId && dto.serverId !== existing.serverId) {
            const newServer = await this.prisma.vpnServer.findUnique({ where: { id: dto.serverId } });
            if (!newServer)
                throw new common_1.NotFoundException('New server not found');
            if (!newServer.panelBaseUrl || !newServer.panelUsername || !newServer.panelPasswordEnc || !newServer.panelInboundId) {
                throw new common_1.BadRequestException('New server is not connected to a panel (missing panelBaseUrl/creds/inboundId)');
            }
            const now = new Date();
            const nextExpiresAt = dto.trialDays
                ? (() => {
                    const endsAt = new Date(now);
                    endsAt.setUTCDate(endsAt.getUTCDate() + dto.trialDays);
                    return endsAt;
                })()
                : dto.expiresAt === undefined
                    ? existing.expiresAt
                    : dto.expiresAt
                        ? new Date(dto.expiresAt)
                        : null;
            if (existing.panelEmail && existing.server) {
                const oldServer = existing.server;
                if (oldServer.panelBaseUrl && oldServer.panelUsername && oldServer.panelPasswordEnc && oldServer.panelInboundId) {
                    try {
                        const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
                        const oldPanelPassword = secret_box_1.SecretBox.decrypt(oldServer.panelPasswordEnc, secret);
                        const oldAuth = await this.xui.login(oldServer.panelBaseUrl, oldServer.panelUsername, oldPanelPassword);
                        if (oldAuth.cookie || oldAuth.token) {
                            await this.xui.deleteClientByEmail(oldServer.panelBaseUrl, oldAuth, oldServer.panelInboundId, existing.panelEmail);
                        }
                    }
                    catch {
                    }
                }
            }
            const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
            const newPanelPassword = secret_box_1.SecretBox.decrypt(newServer.panelPasswordEnc, secret);
            const newAuth = await this.xui.login(newServer.panelBaseUrl, newServer.panelUsername, newPanelPassword);
            if (!newAuth.cookie && !newAuth.token)
                throw new common_1.BadRequestException('New server panel login failed');
            const flow = newServer.security === 'REALITY' ? 'xtls-rprx-vision' : '';
            const expiryTimeMs = nextExpiresAt ? nextExpiresAt.getTime() : 0;
            await this.xui.addClient(newServer.panelBaseUrl, newAuth, newServer.panelInboundId, {
                id: existing.uuid,
                email: existing.panelEmail ?? this.makePanelEmail(nextName, existing.id, nextTelegramId ?? undefined),
                enable: nextStatus !== 'BLOCKED',
                expiryTime: expiryTimeMs,
                flow,
                tgId: nextTelegramId ?? '',
                subId: nextName,
                comment: nextName,
            });
            const updatedPanelEmail = existing.panelEmail ?? this.makePanelEmail(nextName, existing.id, nextTelegramId ?? undefined);
            if (dto.trialDays) {
                await this.prisma.$transaction(async (tx) => {
                    await tx.subscription.updateMany({
                        where: { vpnUserId: id, active: true },
                        data: { active: false },
                    });
                    await tx.subscription.create({
                        data: {
                            vpnUserId: id,
                            periodDays: dto.trialDays,
                            startsAt: now,
                            endsAt: nextExpiresAt,
                            active: true,
                        },
                    });
                    await tx.vpnUser.update({
                        where: { id },
                        data: {
                            serverId: nextServerId,
                            name: nextName,
                            telegramId: nextTelegramId,
                            status: nextStatus,
                            expiresAt: nextExpiresAt,
                            panelEmail: updatedPanelEmail,
                        },
                    });
                });
                return this.get(id);
            }
            return this.prisma.vpnUser.update({
                where: { id },
                data: {
                    serverId: nextServerId,
                    name: dto.name,
                    telegramId: dto.telegramId === undefined ? undefined : nextTelegramId,
                    status: dto.status,
                    expiresAt: dto.expiresAt === undefined ? undefined : nextExpiresAt,
                    panelEmail: updatedPanelEmail,
                },
                include: { server: true },
            });
        }
        const now = new Date();
        const nextExpiresAt = dto.trialDays
            ? (() => {
                const endsAt = new Date(now);
                endsAt.setUTCDate(endsAt.getUTCDate() + dto.trialDays);
                return endsAt;
            })()
            : dto.expiresAt === undefined
                ? existing.expiresAt
                : dto.expiresAt
                    ? new Date(dto.expiresAt)
                    : null;
        if (existing.panelEmail || existing.userServers?.length) {
            const activeUserServer = await this.prisma.userServer.findFirst({
                where: { vpnUserId: id, active: true, isActive: true },
                include: { server: true },
            });
            if (activeUserServer) {
                const us = activeUserServer;
                const server = us.server;
                if (server.panelBaseUrl &&
                    server.panelUsername &&
                    server.panelPasswordEnc &&
                    server.panelInboundId) {
                    try {
                        const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
                        const panelPassword = secret_box_1.SecretBox.decrypt(server.panelPasswordEnc, secret);
                        const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
                        if (auth.cookie || auth.token) {
                            const flow = server.security === 'REALITY' ? 'xtls-rprx-vision' : '';
                            await this.xui.updateClientByEmail(server.panelBaseUrl, auth, server.panelInboundId, us.panelEmail, {
                                id: existing.uuid,
                                enable: nextStatus !== 'BLOCKED',
                                expiryTime: nextExpiresAt ? nextExpiresAt.getTime() : 0,
                                flow,
                                tgId: nextTelegramId ?? '',
                                subId: nextName,
                                comment: nextName,
                            });
                        }
                    }
                    catch {
                    }
                }
            }
            if (!activeUserServer && existing.panelEmail && existing.server) {
                const server = existing.server;
                if (server.panelBaseUrl && server.panelUsername && server.panelPasswordEnc && server.panelInboundId) {
                    const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
                    const panelPassword = secret_box_1.SecretBox.decrypt(server.panelPasswordEnc, secret);
                    const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
                    if (!auth.cookie && !auth.token)
                        throw new common_1.BadRequestException('Panel login failed');
                    const flow = server.security === 'REALITY' ? 'xtls-rprx-vision' : '';
                    await this.xui.updateClientByEmail(server.panelBaseUrl, auth, server.panelInboundId, existing.panelEmail, {
                        id: existing.uuid,
                        enable: nextStatus !== 'BLOCKED',
                        expiryTime: nextExpiresAt ? nextExpiresAt.getTime() : 0,
                        flow,
                        tgId: nextTelegramId ?? '',
                        subId: nextName,
                        comment: nextName,
                    });
                }
            }
        }
        if (dto.trialDays) {
            await this.prisma.$transaction(async (tx) => {
                await tx.subscription.updateMany({
                    where: { vpnUserId: id, active: true },
                    data: { active: false },
                });
                await tx.subscription.create({
                    data: {
                        vpnUserId: id,
                        periodDays: dto.trialDays,
                        startsAt: now,
                        endsAt: nextExpiresAt,
                        active: true,
                    },
                });
                await tx.vpnUser.update({
                    where: { id },
                    data: {
                        serverId: dto.serverId,
                        name: nextName,
                        telegramId: nextTelegramId,
                        status: nextStatus,
                        expiresAt: nextExpiresAt,
                    },
                });
            });
            return this.get(id);
        }
        return this.prisma.vpnUser.update({
            where: { id },
            data: {
                serverId: dto.serverId,
                name: dto.name,
                telegramId: dto.telegramId === undefined ? undefined : nextTelegramId,
                status: dto.status,
                expiresAt: dto.expiresAt === undefined ? undefined : nextExpiresAt,
            },
            include: { server: true },
        });
    }
    async remove(id) {
        const user = await this.prisma.vpnUser.findUnique({
            where: { id },
            include: {
                userServers: {
                    include: { server: true },
                },
                server: true,
            },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        for (const us of user.userServers) {
            const server = us.server;
            if (server.panelBaseUrl &&
                server.panelUsername &&
                server.panelPasswordEnc &&
                server.panelInboundId) {
                try {
                    const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
                    const panelPassword = secret_box_1.SecretBox.decrypt(server.panelPasswordEnc, secret);
                    const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
                    if (auth.cookie || auth.token) {
                        await this.xui.deleteClientByEmail(server.panelBaseUrl, auth, server.panelInboundId, us.panelEmail);
                    }
                }
                catch {
                }
            }
        }
        if (user.userServers.length === 0 && user.panelEmail && user.server) {
            const server = user.server;
            if (server.panelBaseUrl &&
                server.panelUsername &&
                server.panelPasswordEnc &&
                server.panelInboundId) {
                try {
                    const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
                    const panelPassword = secret_box_1.SecretBox.decrypt(server.panelPasswordEnc, secret);
                    const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
                    if (auth.cookie || auth.token) {
                        await this.xui.deleteClientByEmail(server.panelBaseUrl, auth, server.panelInboundId, user.panelEmail);
                    }
                }
                catch {
                }
            }
        }
        await this.prisma.vpnUser.delete({ where: { id } });
        return { ok: true };
    }
    async addServer(userId, serverId) {
        const user = await this.prisma.vpnUser.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const server = await this.prisma.vpnServer.findUnique({ where: { id: serverId } });
        if (!server)
            throw new common_1.NotFoundException('Server not found');
        const existing = await this.prisma.userServer.findUnique({
            where: { vpnUserId_serverId: { vpnUserId: userId, serverId } },
        });
        if (existing) {
            if (!existing.active) {
                await this.prisma.userServer.update({
                    where: { id: existing.id },
                    data: { active: true },
                });
                return this.get(userId);
            }
            throw new common_1.BadRequestException('Server already added to user');
        }
        if (!server.panelBaseUrl || !server.panelUsername || !server.panelPasswordEnc || !server.panelInboundId) {
            throw new common_1.BadRequestException('Server is not connected to a panel (missing panelBaseUrl/creds/inboundId)');
        }
        const panelEmail = this.makePanelEmail(user.name, user.id, user.telegramId ?? undefined, serverId);
        try {
            const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
            const panelPassword = secret_box_1.SecretBox.decrypt(server.panelPasswordEnc, secret);
            const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
            if (!auth.cookie && !auth.token)
                throw new common_1.BadRequestException('Panel login failed');
            const expiryTimeMs = user.expiresAt ? user.expiresAt.getTime() : 0;
            const flow = server.security === 'REALITY' ? 'xtls-rprx-vision' : '';
            await this.xui.addClient(server.panelBaseUrl, auth, server.panelInboundId, {
                id: user.uuid,
                email: panelEmail,
                enable: user.status !== 'BLOCKED',
                expiryTime: expiryTimeMs,
                flow,
                tgId: user.telegramId ?? '',
                subId: user.name,
                comment: user.name,
            });
            const previousActive = await this.prisma.userServer.findFirst({
                where: { vpnUserId: userId, isActive: true },
                include: { server: true },
            });
            if (previousActive) {
                const oldServer = previousActive.server;
                if (oldServer.panelBaseUrl &&
                    oldServer.panelUsername &&
                    oldServer.panelPasswordEnc &&
                    oldServer.panelInboundId) {
                    try {
                        const oldSecret = this.config.getOrThrow('PANEL_CRED_SECRET');
                        const oldPanelPassword = secret_box_1.SecretBox.decrypt(oldServer.panelPasswordEnc, oldSecret);
                        const oldAuth = await this.xui.login(oldServer.panelBaseUrl, oldServer.panelUsername, oldPanelPassword);
                        if (oldAuth.cookie || oldAuth.token) {
                            await this.xui.deleteClientByEmail(oldServer.panelBaseUrl, oldAuth, oldServer.panelInboundId, previousActive.panelEmail);
                        }
                    }
                    catch {
                    }
                }
                await this.prisma.userServer.update({
                    where: { id: previousActive.id },
                    data: { isActive: false },
                });
            }
            await this.prisma.userServer.create({
                data: {
                    vpnUserId: userId,
                    serverId,
                    panelEmail,
                    active: true,
                    isActive: true,
                },
            });
            return this.get(userId);
        }
        catch (e) {
            throw e;
        }
    }
    async removeServer(userId, serverId) {
        const user = await this.prisma.vpnUser.findUnique({
            where: { id: userId },
            include: {
                userServers: {
                    where: { active: true },
                },
            },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const userServer = await this.prisma.userServer.findUnique({
            where: { vpnUserId_serverId: { vpnUserId: userId, serverId } },
            include: { server: true },
        });
        if (!userServer)
            throw new common_1.NotFoundException('User server not found');
        const activeServersCount = user.userServers.length;
        const hasLegacyServer = user.serverId !== null;
        const totalActiveServers = activeServersCount + (hasLegacyServer ? 1 : 0);
        if (totalActiveServers <= 1) {
            throw new common_1.BadRequestException('Cannot remove the last active server. User must have at least one server.');
        }
        const server = userServer.server;
        const wasActive = userServer.isActive;
        if (server.panelBaseUrl &&
            server.panelUsername &&
            server.panelPasswordEnc &&
            server.panelInboundId) {
            try {
                const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
                const panelPassword = secret_box_1.SecretBox.decrypt(server.panelPasswordEnc, secret);
                const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
                if (auth.cookie || auth.token) {
                    await this.xui.deleteClientByEmail(server.panelBaseUrl, auth, server.panelInboundId, userServer.panelEmail);
                }
            }
            catch {
            }
        }
        await this.prisma.userServer.delete({ where: { id: userServer.id } });
        if (wasActive) {
            const remainingActive = await this.prisma.userServer.findFirst({
                where: { vpnUserId: userId, active: true },
            });
            if (remainingActive) {
                await this.prisma.userServer.update({
                    where: { id: remainingActive.id },
                    data: { isActive: true },
                });
                const newActiveServer = await this.prisma.vpnServer.findUnique({
                    where: { id: remainingActive.serverId },
                });
                if (newActiveServer &&
                    newActiveServer.panelBaseUrl &&
                    newActiveServer.panelUsername &&
                    newActiveServer.panelPasswordEnc &&
                    newActiveServer.panelInboundId) {
                    try {
                        const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
                        const panelPassword = secret_box_1.SecretBox.decrypt(newActiveServer.panelPasswordEnc, secret);
                        const auth = await this.xui.login(newActiveServer.panelBaseUrl, newActiveServer.panelUsername, panelPassword);
                        if (auth.cookie || auth.token) {
                            const expiryTimeMs = user.expiresAt ? user.expiresAt.getTime() : 0;
                            const flow = newActiveServer.security === 'REALITY' ? 'xtls-rprx-vision' : '';
                            await this.xui.addClient(newActiveServer.panelBaseUrl, auth, newActiveServer.panelInboundId, {
                                id: user.uuid,
                                email: remainingActive.panelEmail,
                                enable: user.status !== 'BLOCKED',
                                expiryTime: expiryTimeMs,
                                flow,
                                tgId: user.telegramId ?? '',
                                subId: user.name,
                                comment: user.name,
                            });
                        }
                    }
                    catch {
                    }
                }
            }
        }
        return this.get(userId);
    }
    async activateServer(userId, serverId) {
        const user = await this.prisma.vpnUser.findUnique({
            where: { id: userId },
            include: {
                userServers: {
                    where: { active: true },
                    include: { server: true },
                },
            },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const targetUserServer = await this.prisma.userServer.findUnique({
            where: { vpnUserId_serverId: { vpnUserId: userId, serverId } },
            include: { server: true },
        });
        if (!targetUserServer)
            throw new common_1.NotFoundException('User server not found');
        if (!targetUserServer.active)
            throw new common_1.BadRequestException('Server is not active');
        const targetServer = targetUserServer.server;
        const currentActive = user.userServers.find((us) => us.isActive);
        if (currentActive && currentActive.id === targetUserServer.id) {
            return this.get(userId);
        }
        if (currentActive) {
            const oldServer = currentActive.server;
            if (oldServer.panelBaseUrl &&
                oldServer.panelUsername &&
                oldServer.panelPasswordEnc &&
                oldServer.panelInboundId) {
                try {
                    const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
                    const oldPanelPassword = secret_box_1.SecretBox.decrypt(oldServer.panelPasswordEnc, secret);
                    const oldAuth = await this.xui.login(oldServer.panelBaseUrl, oldServer.panelUsername, oldPanelPassword);
                    if (oldAuth.cookie || oldAuth.token) {
                        await this.xui.deleteClientByEmail(oldServer.panelBaseUrl, oldAuth, oldServer.panelInboundId, currentActive.panelEmail);
                    }
                }
                catch {
                }
            }
        }
        if (!targetServer.panelBaseUrl || !targetServer.panelUsername || !targetServer.panelPasswordEnc || !targetServer.panelInboundId) {
            throw new common_1.BadRequestException('Target server is not connected to a panel');
        }
        const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
        const panelPassword = secret_box_1.SecretBox.decrypt(targetServer.panelPasswordEnc, secret);
        const auth = await this.xui.login(targetServer.panelBaseUrl, targetServer.panelUsername, panelPassword);
        if (!auth.cookie && !auth.token)
            throw new common_1.BadRequestException('Panel login failed');
        const expiryTimeMs = user.expiresAt ? user.expiresAt.getTime() : 0;
        const flow = targetServer.security === 'REALITY' ? 'xtls-rprx-vision' : '';
        await this.xui.addClient(targetServer.panelBaseUrl, auth, targetServer.panelInboundId, {
            id: user.uuid,
            email: targetUserServer.panelEmail,
            enable: user.status !== 'BLOCKED',
            expiryTime: expiryTimeMs,
            flow,
            tgId: user.telegramId ?? '',
            subId: user.name,
            comment: user.name,
        });
        await this.prisma.$transaction(async (tx) => {
            await tx.userServer.updateMany({
                where: { vpnUserId: userId },
                data: { isActive: false },
            });
            await tx.userServer.update({
                where: { id: targetUserServer.id },
                data: { isActive: true },
            });
        });
        return this.get(userId);
    }
    async getTraffic(userId) {
        const user = await this.prisma.vpnUser.findUnique({
            where: { id: userId },
            include: {
                userServers: {
                    where: { active: true, isActive: true },
                    include: { server: true },
                },
                server: true,
            },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const trafficData = [];
        const activeUserServer = user.userServers.find((us) => us.isActive);
        if (activeUserServer) {
            const server = activeUserServer.server;
            if (server.panelBaseUrl &&
                server.panelUsername &&
                server.panelPasswordEnc &&
                server.panelInboundId) {
                try {
                    const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
                    const panelPassword = secret_box_1.SecretBox.decrypt(server.panelPasswordEnc, secret);
                    const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
                    if (auth.cookie || auth.token) {
                        const traffic = await this.xui.getClientTraffic(server.panelBaseUrl, auth, server.panelInboundId, activeUserServer.panelEmail);
                        trafficData.push({
                            serverId: server.id,
                            serverName: server.name,
                            panelEmail: activeUserServer.panelEmail,
                            up: traffic.up,
                            down: traffic.down,
                            total: traffic.total,
                            reset: traffic.reset,
                            lastOnline: traffic.lastOnline,
                        });
                    }
                }
                catch (e) {
                }
            }
        }
        else if (user.panelEmail && user.server) {
            const server = user.server;
            if (server.panelBaseUrl &&
                server.panelUsername &&
                server.panelPasswordEnc &&
                server.panelInboundId) {
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
                }
            }
        }
        return { traffic: trafficData };
    }
    async resetTraffic(userId) {
        const user = await this.prisma.vpnUser.findUnique({
            where: { id: userId },
            include: {
                userServers: {
                    where: { active: true, isActive: true },
                    include: { server: true },
                },
                server: true,
            },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const activeUserServer = user.userServers.find((us) => us.isActive);
        if (activeUserServer) {
            const server = activeUserServer.server;
            if (server.panelBaseUrl &&
                server.panelUsername &&
                server.panelPasswordEnc &&
                server.panelInboundId) {
                const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
                const panelPassword = secret_box_1.SecretBox.decrypt(server.panelPasswordEnc, secret);
                const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
                if (!auth.cookie && !auth.token)
                    throw new common_1.BadRequestException('Panel login failed');
                await this.xui.resetClientTraffic(server.panelBaseUrl, auth, server.panelInboundId, activeUserServer.panelEmail);
                return { ok: true };
            }
        }
        else if (user.panelEmail && user.server) {
            const server = user.server;
            if (server.panelBaseUrl &&
                server.panelUsername &&
                server.panelPasswordEnc &&
                server.panelInboundId) {
                const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
                const panelPassword = secret_box_1.SecretBox.decrypt(server.panelPasswordEnc, secret);
                const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
                if (!auth.cookie && !auth.token)
                    throw new common_1.BadRequestException('Panel login failed');
                await this.xui.resetClientTraffic(server.panelBaseUrl, auth, server.panelInboundId, user.panelEmail);
                return { ok: true };
            }
        }
        throw new common_1.BadRequestException('User has no active server connected to panel');
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        xui_service_1.XuiService,
        config_1.ConfigService])
], UsersService);
//# sourceMappingURL=users.service.js.map