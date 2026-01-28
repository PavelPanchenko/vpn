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
exports.ServersService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const xui_service_1 = require("../xui/xui.service");
const secret_box_1 = require("../../common/crypto/secret-box");
let ServersService = class ServersService {
    prisma;
    xui;
    config;
    constructor(prisma, xui, config) {
        this.prisma = prisma;
        this.xui = xui;
        this.config = config;
    }
    maskServer(server) {
        const { panelPasswordEnc, ...rest } = server;
        return rest;
    }
    async list() {
        const [servers, activeUsers] = await this.prisma.$transaction([
            this.prisma.vpnServer.findMany({
                orderBy: { createdAt: 'desc' },
                include: { _count: { select: { users: true } } },
            }),
            this.prisma.vpnUser.findMany({
                where: { status: 'ACTIVE' },
                select: { serverId: true },
            }),
        ]);
        const activeByServer = new Map();
        for (const u of activeUsers) {
            if (u.serverId) {
                activeByServer.set(u.serverId, (activeByServer.get(u.serverId) ?? 0) + 1);
            }
        }
        return servers.map((s) => {
            const usersCount = s._count.users;
            const activeUsersCount = activeByServer.get(s.id) ?? 0;
            const freeSlots = s.maxUsers > 0 ? Math.max(0, s.maxUsers - usersCount) : null;
            const { _count, ...rest } = s;
            return this.maskServer({ ...rest, usersCount, activeUsersCount, freeSlots });
        });
    }
    async get(id) {
        const server = await this.prisma.vpnServer.findUnique({ where: { id } });
        if (!server)
            throw new common_1.NotFoundException('Server not found');
        return this.maskServer(server);
    }
    create(dto) {
        return this.prisma.vpnServer.create({
            data: {
                name: dto.name,
                host: dto.host,
                port: dto.port,
                protocol: 'VLESS',
                transport: dto.transport,
                tls: dto.tls,
                security: dto.tls ? 'TLS' : 'NONE',
                path: dto.path ?? null,
                publicKey: dto.publicKey,
                shortId: dto.shortId,
                maxUsers: dto.maxUsers,
                active: dto.active,
            },
        });
    }
    async update(id, dto) {
        await this.get(id);
        let security;
        if (dto.security !== undefined) {
            security = dto.security;
        }
        else if (dto.tls !== undefined) {
            security = dto.tls ? 'TLS' : 'NONE';
        }
        const updated = await this.prisma.vpnServer.update({
            where: { id },
            data: {
                name: dto.name,
                host: dto.host,
                port: dto.port,
                transport: dto.transport,
                tls: dto.tls,
                security: security,
                path: dto.path === undefined ? undefined : dto.path ?? null,
                sni: dto.sni === undefined ? undefined : dto.sni ?? null,
                publicKey: dto.publicKey,
                shortId: dto.shortId,
                maxUsers: dto.maxUsers,
                active: dto.active,
            },
        });
        return this.maskServer(updated);
    }
    async testPanel(dto) {
        const auth = await this.xui.login(dto.panelBaseUrl, dto.panelUsername, dto.panelPassword);
        if (!auth.cookie && !auth.token) {
            throw new common_1.BadRequestException('Panel login failed');
        }
        const inbounds = await this.xui.listInbounds(dto.panelBaseUrl, auth);
        return { ok: true, inboundsCount: inbounds.length };
    }
    async listPanelInbounds(dto) {
        const auth = await this.xui.login(dto.panelBaseUrl, dto.panelUsername, dto.panelPassword);
        if (!auth.cookie && !auth.token) {
            throw new common_1.BadRequestException('Panel login failed');
        }
        const inbounds = await this.xui.listInbounds(dto.panelBaseUrl, auth);
        return inbounds.map((i) => ({
            id: i.id,
            remark: i.remark ?? '',
            protocol: i.protocol,
            port: i.port,
            enable: Boolean(i.enable),
            tag: i.tag ?? '',
        }));
    }
    parseJsonString(value) {
        if (!value)
            return null;
        try {
            return JSON.parse(value);
        }
        catch {
            return null;
        }
    }
    deriveServerFieldsFromInbound(panelBaseUrl, inbound) {
        const stream = this.parseJsonString(inbound?.streamSettings) ?? inbound?.streamSettings ?? null;
        const network = stream?.network;
        const security = stream?.security;
        const isWs = network === 'ws';
        const transport = isWs ? 'WS' : 'TCP';
        const sec = security === 'reality' ? 'REALITY' : security === 'tls' ? 'TLS' : 'NONE';
        const tls = sec !== 'NONE';
        const wsPath = stream?.wsSettings?.path ?? stream?.wsSettings?.Path ?? null;
        const path = isWs ? wsPath : null;
        const reality = stream?.realitySettings ?? null;
        const sni = reality?.serverNames?.[0] ??
            reality?.serverName ??
            null;
        const publicKey = reality?.settings?.publicKey ??
            null;
        const shortId = reality?.shortIds?.[0] ?? null;
        const hasRealityData = reality && publicKey && typeof publicKey === 'string' && publicKey.trim().length > 0 && shortId && typeof shortId === 'string' && shortId.trim().length > 0;
        const finalSec = hasRealityData ? 'REALITY' : sec;
        const external = Array.isArray(stream?.externalProxy) ? stream.externalProxy[0] : null;
        const host = external?.dest ?? new URL(panelBaseUrl).hostname;
        const port = Number(external?.port ?? inbound?.port);
        if (!port || Number.isNaN(port))
            throw new common_1.BadRequestException('Inbound port invalid');
        if (finalSec === 'REALITY' && (!publicKey || !shortId)) {
            throw new common_1.BadRequestException('Inbound missing reality publicKey/shortId');
        }
        return {
            host,
            port,
            transport,
            tls: finalSec !== 'NONE',
            security: finalSec,
            sni,
            path,
            publicKey: publicKey ?? '',
            shortId: shortId ?? '',
        };
    }
    async createFromPanel(dto) {
        const auth = await this.xui.login(dto.panelBaseUrl, dto.panelUsername, dto.panelPassword);
        if (!auth.cookie && !auth.token) {
            throw new common_1.BadRequestException('Panel login failed');
        }
        const inbound = await this.xui.getInbound(dto.panelBaseUrl, dto.inboundId, auth);
        const derived = this.deriveServerFieldsFromInbound(dto.panelBaseUrl, inbound);
        const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
        const panelPasswordEnc = secret_box_1.SecretBox.encrypt(dto.panelPassword, secret);
        const created = await this.prisma.vpnServer.create({
            data: {
                name: dto.name,
                protocol: 'VLESS',
                host: derived.host,
                port: derived.port,
                transport: derived.transport,
                tls: derived.tls,
                security: derived.security,
                sni: derived.sni,
                path: derived.path,
                publicKey: derived.publicKey,
                shortId: derived.shortId,
                maxUsers: dto.maxUsers ?? 0,
                active: dto.active ?? true,
                panelBaseUrl: dto.panelBaseUrl,
                panelUsername: dto.panelUsername,
                panelPasswordEnc,
                panelInboundId: dto.inboundId,
            },
        });
        return this.maskServer(created);
    }
    async syncFromPanel(serverId, dto) {
        const server = await this.prisma.vpnServer.findUnique({ where: { id: serverId } });
        if (!server)
            throw new common_1.NotFoundException('Server not found');
        if (!server.panelBaseUrl || !server.panelUsername || !server.panelPasswordEnc) {
            throw new common_1.BadRequestException('Server is not connected to a panel');
        }
        const secret = this.config.getOrThrow('PANEL_CRED_SECRET');
        const panelPassword = secret_box_1.SecretBox.decrypt(server.panelPasswordEnc, secret);
        const inboundId = dto.inboundId ?? server.panelInboundId;
        if (!inboundId)
            throw new common_1.BadRequestException('inboundId is required');
        const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
        if (!auth.cookie && !auth.token)
            throw new common_1.BadRequestException('Panel login failed');
        const inbound = await this.xui.getInbound(server.panelBaseUrl, inboundId, auth);
        const derived = this.deriveServerFieldsFromInbound(server.panelBaseUrl, inbound);
        const updated = await this.prisma.vpnServer.update({
            where: { id: serverId },
            data: {
                host: derived.host,
                port: derived.port,
                transport: derived.transport,
                tls: derived.tls,
                security: derived.security,
                sni: derived.sni,
                path: derived.path,
                publicKey: derived.publicKey,
                shortId: derived.shortId,
                panelInboundId: inboundId,
            },
        });
        return this.maskServer(updated);
    }
    async remove(id) {
        await this.prisma.vpnServer.findUnique({ where: { id } }).then((s) => {
            if (!s)
                throw new common_1.NotFoundException('Server not found');
        });
        try {
            await this.prisma.vpnServer.delete({ where: { id } });
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError) {
                if (e.code === 'P2003') {
                    throw new common_1.ConflictException('Cannot delete server with existing users');
                }
            }
            throw e;
        }
        return { ok: true };
    }
};
exports.ServersService = ServersService;
exports.ServersService = ServersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        xui_service_1.XuiService,
        config_1.ConfigService])
], ServersService);
//# sourceMappingURL=servers.service.js.map