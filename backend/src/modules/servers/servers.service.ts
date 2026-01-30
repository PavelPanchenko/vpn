import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServerDto } from './dto/create-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { XuiService } from '../xui/xui.service';
import { SecretBox } from '../../common/crypto/secret-box';
import { CreateServerFromPanelDto, PanelAuthDto, SyncServerFromPanelDto } from './dto/panel-auth.dto';

@Injectable()
export class ServersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xui: XuiService,
    private readonly config: ConfigService,
  ) {}

  private maskServer(server: any) {
    // never return encrypted password to frontend
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { panelPasswordEnc, ...rest } = server;
    return rest;
  }

  private parseJsonString(value?: string) {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  private redactInbound(inbound: any) {
    const clone: any = JSON.parse(JSON.stringify(inbound ?? {}));
    const parse = (v: any) => (typeof v === 'string' ? this.parseJsonString(v) ?? v : v);
    clone.settings = parse(clone.settings);
    clone.streamSettings = parse(clone.streamSettings);
    clone.sniffing = parse(clone.sniffing);

    const stream = clone.streamSettings;
    if (stream?.realitySettings) {
      if (typeof stream.realitySettings.privateKey === 'string') stream.realitySettings.privateKey = '[REDACTED]';
      if (Array.isArray(stream.realitySettings.shortIds)) stream.realitySettings.shortIds = ['[REDACTED]'];
    }
    clone.redacted = true;
    return clone;
  }

  private deriveServerFieldsFromInbound(panelBaseUrl: string, inbound: any) {
    const stream = this.parseJsonString(inbound?.streamSettings) ?? inbound?.streamSettings ?? null;
    const network = stream?.network;
    const security = stream?.security;

    const isWs = network === 'ws';
    const transport: 'WS' | 'TCP' = isWs ? 'WS' : 'TCP';

    const sec: 'REALITY' | 'TLS' | 'NONE' =
      security === 'reality' ? 'REALITY' : security === 'tls' ? 'TLS' : 'NONE';

    const wsPath = stream?.wsSettings?.path ?? stream?.wsSettings?.Path ?? null;
    const path = isWs ? wsPath : null;

    const reality = stream?.realitySettings ?? null;
    const sni = reality?.serverNames?.[0] ?? reality?.serverName ?? null;
    const publicKey = reality?.settings?.publicKey ?? null;
    const shortId = reality?.shortIds?.[0] ?? null;

    const hasRealityData =
      reality &&
      publicKey &&
      typeof publicKey === 'string' &&
      publicKey.trim().length > 0 &&
      shortId &&
      typeof shortId === 'string' &&
      shortId.trim().length > 0;

    const finalSec: 'REALITY' | 'TLS' | 'NONE' = hasRealityData ? 'REALITY' : sec;

    const external = Array.isArray(stream?.externalProxy) ? stream.externalProxy[0] : null;
    const host = (external?.dest as string | undefined) ?? new URL(panelBaseUrl).hostname;
    const port = Number(external?.port ?? inbound?.port);
    if (!port || Number.isNaN(port)) throw new BadRequestException('Inbound port invalid');
    if (finalSec === 'REALITY' && (!publicKey || !shortId)) {
      throw new BadRequestException('Inbound missing reality publicKey/shortId');
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

  async getConnectedInbound(serverId: string) {
    const server = await this.prisma.vpnServer.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');
    if (!server.panelBaseUrl || !server.panelUsername || !server.panelPasswordEnc || server.panelInboundId == null) {
      throw new BadRequestException('Server is not connected to a panel');
    }

    const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
    const panelPassword = SecretBox.decrypt(server.panelPasswordEnc, secret);
    const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
    if (!auth.cookie && !auth.token) throw new BadRequestException('Panel login failed');

    const inbound = await this.xui.getInbound(server.panelBaseUrl, server.panelInboundId, auth);
    return this.redactInbound(inbound);
  }

  async list() {
    const [servers, activeUsers] = await this.prisma.$transaction([
      this.prisma.vpnServer.findMany({
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { users: true, userServers: true } } },
      }),
      this.prisma.vpnUser.findMany({
        where: { status: 'ACTIVE' },
        select: { serverId: true },
      }),
    ]);

    const activeByServer = new Map<string, number>();
    for (const u of activeUsers) {
      if (u.serverId) {
        activeByServer.set(u.serverId, (activeByServer.get(u.serverId) ?? 0) + 1);
      }
    }

    return servers.map((s) => {
      const usersOnServer = s._count.userServers;
      const activeUsersCount = activeByServer.get(s.id) ?? 0;
      const freeSlots = s.maxUsers > 0 ? Math.max(0, s.maxUsers - usersOnServer) : null;

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _count, ...rest } = s;
      return this.maskServer({
        ...rest,
        usersCount: usersOnServer,
        activeUsersCount,
        freeSlots,
      });
    });
  }

  async get(id: string) {
    const server = await this.prisma.vpnServer.findUnique({ where: { id } });
    if (!server) throw new NotFoundException('Server not found');
    return this.maskServer(server);
  }

  async create(dto: CreateServerDto) {
    if (dto.isRecommended) {
      await this.prisma.vpnServer.updateMany({ data: { isRecommended: false } });
    }
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
        isRecommended: dto.isRecommended ?? false,
        active: dto.active,
      },
    });
  }

  async update(id: string, dto: UpdateServerDto) {
    await this.get(id);

    if (dto.isRecommended === true) {
      await this.prisma.vpnServer.updateMany({ where: { id: { not: id } }, data: { isRecommended: false } });
    }

    let security: 'NONE' | 'TLS' | 'REALITY' | undefined;
    if (dto.security !== undefined) {
      security = dto.security;
    } else if (dto.tls !== undefined) {
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
        isRecommended: dto.isRecommended,
        active: dto.active,
      },
    });
    return this.maskServer(updated);
  }

  async testPanel(dto: PanelAuthDto) {
    const auth = await this.xui.login(dto.panelBaseUrl, dto.panelUsername, dto.panelPassword);
    if (!auth.cookie && !auth.token) {
      throw new BadRequestException('Panel login failed');
    }
    const inbounds = await this.xui.listInbounds(dto.panelBaseUrl, auth);
    return { ok: true, inboundsCount: inbounds.length };
  }

  async listPanelInbounds(dto: PanelAuthDto) {
    const auth = await this.xui.login(dto.panelBaseUrl, dto.panelUsername, dto.panelPassword);
    if (!auth.cookie && !auth.token) {
      throw new BadRequestException('Panel login failed');
    }
    const inbounds = await this.xui.listInbounds(dto.panelBaseUrl, auth);
    return inbounds.map((i: { id: number; remark?: string; protocol?: string; port?: number; enable?: boolean; tag?: string }) => ({
      id: i.id,
      remark: i.remark ?? '',
      protocol: i.protocol,
      port: i.port,
      enable: Boolean(i.enable),
      tag: i.tag ?? '',
    }));
  }

  async createFromPanel(dto: CreateServerFromPanelDto) {
    const auth = await this.xui.login(dto.panelBaseUrl, dto.panelUsername, dto.panelPassword);
    if (!auth.cookie && !auth.token) throw new BadRequestException('Panel login failed');

    const inbound = await this.xui.getInbound(dto.panelBaseUrl, dto.inboundId, auth);
    const derived = this.deriveServerFieldsFromInbound(dto.panelBaseUrl, inbound);

    const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
    const panelPasswordEnc = SecretBox.encrypt(dto.panelPassword, secret);

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

  async syncFromPanel(serverId: string, dto: SyncServerFromPanelDto) {
    const server = await this.prisma.vpnServer.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');
    if (!server.panelBaseUrl || !server.panelUsername || !server.panelPasswordEnc) {
      throw new BadRequestException('Server is not connected to a panel');
    }

    const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
    const panelPassword = SecretBox.decrypt(server.panelPasswordEnc, secret);

    const inboundId = dto.inboundId ?? server.panelInboundId;
    if (!inboundId) throw new BadRequestException('inboundId is required');

    const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
    if (!auth.cookie && !auth.token) throw new BadRequestException('Panel login failed');
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

  async remove(id: string) {
    await this.prisma.vpnServer.findUnique({ where: { id } }).then((s: any) => {
      if (!s) throw new NotFoundException('Server not found');
    });
    try {
      await this.prisma.vpnServer.delete({ where: { id } });
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2003') {
          throw new ConflictException('Cannot delete server with existing users');
        }
      }
      throw e;
    }
    return { ok: true };
  }
}

