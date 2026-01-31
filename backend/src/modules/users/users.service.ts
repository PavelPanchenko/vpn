import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type VpnUser } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { XuiService } from '../xui/xui.service';
import { SecretBox } from '../../common/crypto/secret-box';
import { addDaysUtc } from '../../common/utils/date.utils';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

/** Единый формат panelEmail: только uuid и serverId. Одинаковый при создании и при поиске. */
function buildPanelEmail(uuid: string, serverId: string): string {
  const prefix = serverId.slice(0, 8);
  return `${uuid}@vpn-${prefix}`;
}

type EnsurePanelClientOptions = { expiryTime?: number; enable?: boolean };

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly xui: XuiService,
    private readonly config: ConfigService,
  ) {}

  /**
   * DRY: единая точка поиска пользователя по telegramId.
   * Важно: используем findFirst, т.к. telegramId не обязательно ключ в Prisma schema (но должен быть уникальным в БД).
   */
  async findByTelegramId(telegramId: string): Promise<VpnUser | null>;
  async findByTelegramId<TInclude extends Prisma.VpnUserInclude>(
    telegramId: string,
    include: TInclude,
  ): Promise<Prisma.VpnUserGetPayload<{ include: TInclude }> | null>;
  async findByTelegramId(telegramId: string, include?: Prisma.VpnUserInclude) {
    return this.prisma.vpnUser.findFirst({
      where: { telegramId },
      ...(include ? { include } : {}),
    });
  }

  /**
   * DRY: единая точка "найти или создать" по telegramId с опциональными include.
   * Полезно для бота и mini app, чтобы не дублировать Prisma-графы.
   */
  async getOrCreateByTelegramId(telegramId: string, name: string): Promise<VpnUser>;
  async getOrCreateByTelegramId<TInclude extends Prisma.VpnUserInclude>(
    telegramId: string,
    name: string,
    include: TInclude,
  ): Promise<Prisma.VpnUserGetPayload<{ include: TInclude }>>;
  async getOrCreateByTelegramId(telegramId: string, name: string, include?: Prisma.VpnUserInclude) {
    if (include) {
      const existing = await this.findByTelegramId(telegramId, include);
      if (existing) return existing;

      const created = await this.createFromTelegram(telegramId, name);
      return this.prisma.vpnUser.findUniqueOrThrow({ where: { id: created.id }, include });
    }

    const existing = await this.findByTelegramId(telegramId);
    if (existing) return existing;
    return this.createFromTelegram(telegramId, name);
  }

  /** Единая точка: добавить/обновить клиента на панели. */
  private async ensurePanelClient(
    server: { panelBaseUrl: string | null; panelUsername: string | null; panelPasswordEnc: string | null; panelInboundId: number | null; security?: string },
    userUuid: string,
    panelEmail: string,
    options?: EnsurePanelClientOptions,
  ): Promise<void> {
    if (!server.panelBaseUrl || !server.panelUsername || !server.panelPasswordEnc || server.panelInboundId == null) return;
    const secret = this.config.get<string>('PANEL_CRED_SECRET');
    if (!secret) return;
    try {
      const panelPassword = SecretBox.decrypt(server.panelPasswordEnc, secret);
      const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
      if (!auth.cookie && !auth.token) return;
      const expiryTime = options?.expiryTime ?? 0;
      try {
        await this.xui.addClient(server.panelBaseUrl, auth, server.panelInboundId, {
          id: userUuid,
          email: panelEmail,
          flow: server.security === 'REALITY' ? 'xtls-rprx-vision' : '',
          expiryTime: expiryTime > 0 ? expiryTime : undefined,
          enable: options?.enable,
        });
      } catch (addErr: any) {
        if (addErr instanceof BadRequestException && addErr.message?.includes('already exists')) {
          await this.xui.updateClient(server.panelBaseUrl, auth, server.panelInboundId, panelEmail, {
            ...(options?.enable !== undefined && { enable: options.enable }),
            ...(options?.expiryTime !== undefined && { expiryTime: options.expiryTime }),
          });
        } else {
          throw addErr;
        }
      }
    } catch (e: any) {
      this.logger.warn(`ensurePanelClient: ${e?.message ?? e}`);
    }
  }

  /** Единая точка: привязать пользователя к серверу (БД + опционально клиент на панели). */
  private async attachUserToServer(
    userId: string,
    serverId: string,
    options: { isActive: boolean; addToPanel: boolean; expiryTime?: number },
  ): Promise<void> {
    const user = await this.prisma.vpnUser.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const server = await this.prisma.vpnServer.findUnique({ where: { id: serverId } });
    if (!server || !server.active) throw new NotFoundException('Server not found');
    const count = await this.prisma.vpnServer.findUnique({
      where: { id: serverId },
      include: { _count: { select: { userServers: true } } },
    }).then((s) => s?._count?.userServers ?? 0);
    if (server.maxUsers > 0 && count >= server.maxUsers) throw new BadRequestException('Server is full');
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

  /**
   * DRY: привести expiresAt/статус к самой поздней активной подписке.
   * Это устраняет рассинхрон между `vpnUser.expiresAt` и `subscription.endsAt`, который ломает шкалу в UI.
   */
  async syncExpiresAtWithActiveSubscription(
    userId: string,
  ): Promise<{ endsAt: Date; periodDays: number } | null> {
    const [user, sub] = await Promise.all([
      this.prisma.vpnUser.findUnique({ where: { id: userId }, select: { expiresAt: true, status: true } }),
      this.prisma.subscription.findFirst({
        where: { vpnUserId: userId, active: true },
        orderBy: { endsAt: 'desc' },
        select: { endsAt: true, periodDays: true },
      }),
    ]);
    if (!user || !sub) return null;
    if (user.status === 'BLOCKED') return { endsAt: sub.endsAt, periodDays: sub.periodDays };

    const now = new Date();
    const nextStatus: 'NEW' | 'ACTIVE' | 'BLOCKED' | 'EXPIRED' =
      sub.endsAt.getTime() < now.getTime() ? 'EXPIRED' : 'ACTIVE';

    const shouldUpdate =
      !user.expiresAt || user.expiresAt.getTime() !== sub.endsAt.getTime() || user.status !== nextStatus;

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

  async get(id: string) {
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
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto) {
    const uuid = randomUUID();
    const server = await this.prisma.vpnServer.findUnique({ where: { id: dto.serverId } });
    if (!server) throw new NotFoundException('Server not found');
    const panelEmail = buildPanelEmail(uuid, dto.serverId);
    let trialEndsAt: Date | null = null;
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

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.vpnUser.findUnique({
      where: { id },
      include: { server: true, userServers: { where: { isActive: true }, include: { server: true } } },
    });
    if (!user) throw new NotFoundException('User not found');

    const updates: Prisma.VpnUserUpdateInput = {};
    if (dto.name != null) updates.name = dto.name;
    if (dto.telegramId !== undefined) updates.telegramId = dto.telegramId;
    if (dto.status != null) updates.status = dto.status;
    // Админка может прислать либо expiresAt (ISO), либо trialDays (число дней).
    // trialDays трактуем как "выдать доступ на N дней от текущего момента" и синхронизируем подписку + пользователя.
    const now = new Date();
    const expiresAtFromTrialDays =
      dto.trialDays != null ? addDaysUtc(now, Number(dto.trialDays)) : null;

    const effectiveExpiresAt =
      dto.trialDays != null ? expiresAtFromTrialDays : (dto.expiresAt !== undefined ? (dto.expiresAt ? new Date(dto.expiresAt) : null) : undefined);

    if (effectiveExpiresAt !== undefined) updates.expiresAt = effectiveExpiresAt;
    if (dto.serverId !== undefined) {
      updates.server = dto.serverId ? { connect: { id: dto.serverId } } : { disconnect: true };
    }

    // Если админ задаёт trialDays — обновляем активную подписку так же, иначе UI будет показывать старые "3 дня".
    if (dto.trialDays != null) {
      const endsAt = expiresAtFromTrialDays!;
      const periodDays = Number(dto.trialDays);
      const nextStatus: 'NEW' | 'ACTIVE' | 'BLOCKED' | 'EXPIRED' =
        (dto.status ?? user.status) === 'BLOCKED'
          ? 'BLOCKED'
          : endsAt.getTime() < now.getTime()
            ? 'EXPIRED'
            : 'ACTIVE';

      await this.prisma.$transaction(async (tx) => {
        // Делаем единственную активную подписку (DRY-инвариант)
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
    } else {
      await this.prisma.vpnUser.update({ where: { id }, data: updates });
    }

    const activeUserServer = user.userServers.find((us) => us.isActive);
    const server = activeUserServer?.server ?? user.server;
    if (server?.panelBaseUrl && server.panelUsername && server.panelPasswordEnc && server.panelInboundId != null) {
      const email = activeUserServer?.panelEmail ?? user.panelEmail;
      if (email) {
        try {
          const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
          const panelPassword = SecretBox.decrypt(server.panelPasswordEnc, secret);
          const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
          if (auth.cookie || auth.token) {
            const expiryTime =
              effectiveExpiresAt === undefined
                ? undefined
                : effectiveExpiresAt
                  ? effectiveExpiresAt.getTime()
                  : 0;
            if (expiryTime !== undefined) {
            await this.xui.updateClient(server.panelBaseUrl, auth, server.panelInboundId, email, { expiryTime });
            }
          }
        } catch (e: any) {
          this.logger.warn(`update: panel sync failed — ${e?.message ?? e}`);
        }
      }
    }
    return this.get(id);
  }

  async remove(id: string) {
    const user = await this.get(id);
    const list: Array<{ server: any; panelEmail: string }> = [];
    if (user.userServers?.length) {
      for (const us of user.userServers) list.push({ server: us.server, panelEmail: us.panelEmail });
    } else if (user.server && user.panelEmail) {
      list.push({ server: user.server, panelEmail: user.panelEmail });
    }
    for (const { server: s, panelEmail: email } of list) {
      if (!s?.panelBaseUrl || !s.panelUsername || !s.panelPasswordEnc || s.panelInboundId == null || !email) continue;
      try {
        const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
        const panelPassword = SecretBox.decrypt(s.panelPasswordEnc, secret);
        const auth = await this.xui.login(s.panelBaseUrl, s.panelUsername, panelPassword);
        if (auth.cookie || auth.token) await this.xui.deleteClient(s.panelBaseUrl, auth, s.panelInboundId, email);
      } catch (e: any) {
        this.logger.warn(`remove: panel deleteClient failed — ${e?.message ?? e}`);
      }
    }
    await this.prisma.vpnUser.delete({ where: { id } });
    return { ok: true };
  }

  async createFromTelegram(telegramId: string, name: string) {
    const uuid = randomUUID();
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
    } catch (e: any) {
      if (e?.code === 'P2002') {
        const existing = await this.prisma.vpnUser.findFirst({ where: { telegramId } });
        if (existing) return existing;
      }
      throw e;
    }
  }

  private buildVlessUrl(server: any, uuid: string, sni: string | null, path: string | null): string {
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
    } else if (server.security === 'TLS' && sni) {
      params.set('sni', sni);
    }
    if (server.transport === 'WS' && path) params.set('path', path);
    const hash = encodeURIComponent(server.name ?? 'VPN');
    return `vless://${uuid}@${server.host}:${server.port}?${params.toString()}#${hash}`;
  }

  async getConfig(userId: string): Promise<{ configs: Array<{ url: string; serverName: string }> }> {
    const user = await this.prisma.vpnUser.findUnique({
      where: { id: userId },
      include: {
        userServers: { where: { active: true, isActive: true }, include: { server: true } },
        server: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const configs: Array<{ url: string; serverName: string }> = [];
    const activeUs = user.userServers?.find((us) => us.isActive);
    if (activeUs) {
      const s = activeUs.server;
      const url = this.buildVlessUrl(s, user.uuid, s.sni ?? null, s.path ?? null);
      configs.push({ url, serverName: s.name });
    } else if (user.server) {
      const s = user.server;
      const url = this.buildVlessUrl(s, user.uuid, s.sni ?? null, s.path ?? null);
      configs.push({ url, serverName: s.name });
    }
    return { configs };
  }

  async addServer(userId: string, serverId: string) {
    await this.attachUserToServer(userId, serverId, { isActive: false, addToPanel: false });
    return this.get(userId);
  }

  async addServerAndTrial(userId: string, serverId: string, trialDays: number): Promise<{ updated: any; trialCreated: boolean }> {
    const user = await this.prisma.vpnUser.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const existing = await this.prisma.userServer.findUnique({
      where: { vpnUserId_serverId: { vpnUserId: userId, serverId } },
    });
    if (existing) {
      // На всякий случай синхронизируем expiry со подпиской перед активацией (DRY, чтобы панель не получала "короткий" expiresAt)
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

    // Если уже есть активная (не истёкшая) подписка — НЕ создаём триал и НЕ перезаписываем expiresAt.
    if (activeSub && activeSub.endsAt.getTime() > now.getTime()) {
      await this.prisma.$transaction(async (tx) => {
        // Переключаем активную локацию
        await tx.userServer.updateMany({ where: { vpnUserId: userId }, data: { isActive: false } });
      });

      await this.attachUserToServer(userId, serverId, {
        isActive: true,
        addToPanel: true,
        expiryTime: activeSub.endsAt.getTime(),
      });

      // Убеждаемся, что expiresAt у пользователя соответствует подписке (DRY)
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
      // Гарантируем единственную активную подписку (иначе ломается шкала в UI)
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

  async activateServer(userId: string, serverId: string) {
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
    if (!us) throw new NotFoundException('User server not found');
    if (!user) throw new NotFoundException('User not found');

    // DRY: перед синхронизацией на панель убедимся, что expiresAt соответствует активной подписке
    await this.syncExpiresAtWithActiveSubscription(userId);

    await this.prisma.$transaction([
      this.prisma.userServer.updateMany({ where: { vpnUserId: userId }, data: { isActive: false } }),
      this.prisma.userServer.update({ where: { id: us.id }, data: { isActive: true } }),
    ]);

    const secret = this.config.get<string>('PANEL_CRED_SECRET');
    if (secret) {
      if (previousActive && previousActive.serverId !== serverId && previousActive.server?.panelBaseUrl && previousActive.server.panelUsername && previousActive.server.panelPasswordEnc && previousActive.server.panelInboundId != null) {
        try {
          const panelPassword = SecretBox.decrypt(previousActive.server.panelPasswordEnc, secret);
          const auth = await this.xui.login(previousActive.server.panelBaseUrl, previousActive.server.panelUsername, panelPassword);
          if (auth.cookie || auth.token) {
            const emailForPanel = buildPanelEmail(user.uuid, previousActive.server.id);
            await this.xui.deleteClient(previousActive.server.panelBaseUrl, auth, previousActive.server.panelInboundId, emailForPanel);
          }
        } catch (e: any) {
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

  async removeServer(userId: string, serverId: string) {
    const us = await this.prisma.userServer.findUnique({
      where: { vpnUserId_serverId: { vpnUserId: userId, serverId } },
      include: { server: true },
    });
    if (!us) throw new NotFoundException('User server not found');
    const server = us.server;
    if (server.panelBaseUrl && server.panelUsername && server.panelPasswordEnc && server.panelInboundId != null) {
      try {
        const user = await this.prisma.vpnUser.findUnique({ where: { id: userId }, select: { uuid: true } });
        if (user) {
          const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
          const panelPassword = SecretBox.decrypt(server.panelPasswordEnc, secret);
          const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
          if (auth.cookie || auth.token) {
            const emailForPanel = buildPanelEmail(user.uuid, server.id);
            await this.xui.deleteClient(server.panelBaseUrl, auth, server.panelInboundId, emailForPanel);
          }
        }
      } catch (e: any) {
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
            const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
            const panelPassword = SecretBox.decrypt(server.panelPasswordEnc, secret);
            const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
            if (auth.cookie || auth.token) await this.xui.deleteClient(server.panelBaseUrl, auth, server.panelInboundId, email);
          } catch (e: any) {
            this.logger.warn(`expireUsersByCron: deleteClient failed for user ${user.id} — ${e?.message ?? e}`);
          }
        }
      }
    }
  }
}
