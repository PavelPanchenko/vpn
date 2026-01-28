import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { randomUUID } from 'crypto';
import { XuiService } from '../xui/xui.service';
import { SecretBox } from '../../common/crypto/secret-box';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xui: XuiService,
    private readonly config: ConfigService,
  ) {}

  /**
   * MVP-стратегия: чтобы гарантировать правило "подписка истекла -> EXPIRED",
   * мы выполняем лёгкий updateMany при каждом чтении пользователей.
   * Это детерминированно и не требует cron на старте.
   */
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

  /**
   * Ежедневная крон‑задача:
   * - находит всех ACTIVE пользователей с истёкшим expiresAt
   * - деактивирует им подписки
   * - ставит статус EXPIRED
   * - по возможности выключает клиента в x-ui панели.
   */
  async expireUsersByCron() {
    const now = new Date();

    const users = await this.prisma.vpnUser.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { not: null, lt: now },
      },
      include: {
        userServers: {
          where: { active: true, isActive: true }, // Только активная локация
          include: { server: true },
        },
        server: true, // Legacy для обратной совместимости
      },
    });

    if (!users.length) return;

    // Пытаемся синхронизировать с панелью (best-effort, чтобы не блокировать весь джоб)
    for (const user of users) {
      // Обрабатываем только активную локацию через UserServer
      const activeUserServer = user.userServers.find((us) => us.isActive);
      if (activeUserServer) {
        const us = activeUserServer;
        const server = us.server;
        if (
          server.panelBaseUrl &&
          server.panelUsername &&
          server.panelPasswordEnc &&
          server.panelInboundId
        ) {
          try {
            const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
            const panelPassword = SecretBox.decrypt(server.panelPasswordEnc, secret);
            const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
            if (auth.cookie || auth.token) {
              const flow = server.security === 'REALITY' ? 'xtls-rprx-vision' : '';

              await this.xui.updateClientByEmail(
                server.panelBaseUrl,
                auth,
                server.panelInboundId,
                us.panelEmail,
                {
                  id: user.uuid,
                  enable: false,
                  expiryTime: user.expiresAt ? user.expiresAt.getTime() : 0,
                  flow,
                  tgId: user.telegramId ?? '',
                  subId: user.name,
                  comment: user.name,
                },
              );
            }
          } catch {
            // Best-effort: продолжаем обработку следующего пользователя
          }
        }
      } else if (user.panelEmail && user.server) {
        // Legacy: обрабатываем старый serverId если нет активной UserServer записи
        const server = user.server;
        if (
          server.panelBaseUrl &&
          server.panelUsername &&
          server.panelPasswordEnc &&
          server.panelInboundId
        ) {
          try {
            const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
            const panelPassword = SecretBox.decrypt(server.panelPasswordEnc, secret);
            const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
            if (auth.cookie || auth.token) {
              const flow = server.security === 'REALITY' ? 'xtls-rprx-vision' : '';

              await this.xui.updateClientByEmail(
                server.panelBaseUrl,
                auth,
                server.panelInboundId,
                user.panelEmail,
                {
                  id: user.uuid,
                  enable: false,
                  expiryTime: user.expiresAt ? user.expiresAt.getTime() : 0,
                  flow,
                  tgId: user.telegramId ?? '',
                  subId: user.name,
                  comment: user.name,
                },
              );
            }
          } catch {
            // Best-effort: продолжаем обработку следующего пользователя
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
        server: true, // Legacy
        userServers: {
          where: { active: true },
          include: { server: true },
        },
      },
    });
  }

  async get(id: string) {
    await this.refreshExpiredStatuses();
    const user = await this.prisma.vpnUser.findUnique({
      where: { id },
      include: {
        server: true, // Legacy
        userServers: {
          include: { server: true },
        },
        subscriptions: { orderBy: { endsAt: 'desc' } },
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto) {
    // Проверяем, что сервер существует
    const server = await this.prisma.vpnServer.findUnique({ where: { id: dto.serverId } });
    if (!server) throw new NotFoundException('Server not found');

    if (!server.panelBaseUrl || !server.panelUsername || !server.panelPasswordEnc || !server.panelInboundId) {
      throw new BadRequestException('Selected server is not connected to a panel (missing panelBaseUrl/creds/inboundId)');
    }

    const now = new Date();
    const trialDays = dto.trialDays ?? 3;
    const endsAt = new Date(now);
    endsAt.setUTCDate(endsAt.getUTCDate() + trialDays);

    // Create user in DB first, then provision panel; rollback DB on failure.
    const created = await this.prisma.vpnUser.create({
      data: {
        serverId: dto.serverId, // Legacy для обратной совместимости
        name: dto.name,
        telegramId: dto.telegramId ?? null,
        uuid: randomUUID(),
        status: 'ACTIVE',
        expiresAt: endsAt,
      },
      include: { server: true },
    });

    const panelEmail = this.makePanelEmail(dto.name, created.id, dto.telegramId, dto.serverId);

    // Create trial subscription record (single source of truth for billing period)
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
      const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
      const panelPassword = SecretBox.decrypt(server.panelPasswordEnc, secret);
      const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
      if (!auth.cookie && !auth.token) throw new BadRequestException('Panel login failed');

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

      // Создаём запись UserServer для множественных серверов
      // Первая локация автоматически становится активной
      await this.prisma.userServer.create({
        data: {
          vpnUserId: created.id,
          serverId: dto.serverId,
          panelEmail,
          active: true,
          isActive: true, // Первая локация активна по умолчанию
        },
      });

      // Обновляем panelEmail в VpnUser для обратной совместимости (первый сервер)
      const updated = await this.prisma.vpnUser.update({
        where: { id: created.id },
        data: { panelEmail },
        include: { server: true, userServers: { include: { server: true } } },
      });

      return updated;
    } catch (e) {
      // Best-effort rollback of DB records if provisioning failed
      await this.prisma.userServer.deleteMany({ where: { vpnUserId: created.id } }).catch(() => undefined);
      await this.prisma.subscription.deleteMany({ where: { vpnUserId: created.id } }).catch(() => undefined);
      await this.prisma.vpnUser.delete({ where: { id: created.id } }).catch(() => undefined);
      throw e;
    }
  }

  /**
   * Создает пользователя без сервера и подписки (для бота при /start)
   */
  async createFromTelegram(telegramId: string, name: string) {
    // Проверяем, не существует ли уже пользователь с таким telegramId
    const existing = await this.prisma.vpnUser.findFirst({
      where: { telegramId },
    });

    if (existing) {
      return existing;
    }

    // Создаём пользователя без сервера и подписки
    return this.prisma.vpnUser.create({
      data: {
        name,
        telegramId,
        uuid: randomUUID(),
        status: 'ACTIVE',
        expiresAt: null, // Нет подписки
        serverId: null, // Нет сервера
      },
      include: { server: true, userServers: { include: { server: true } } },
    });
  }

  /**
   * Добавляет сервер и триал подписку к существующему пользователю
   */
  async addServerAndTrial(userId: string, serverId: string, trialDays: number = 3) {
    const user = await this.prisma.vpnUser.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const server = await this.prisma.vpnServer.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');

    if (!server.panelBaseUrl || !server.panelUsername || !server.panelPasswordEnc || !server.panelInboundId) {
      throw new BadRequestException('Selected server is not connected to a panel (missing panelBaseUrl/creds/inboundId)');
    }

    const now = new Date();
    const endsAt = new Date(now);
    endsAt.setUTCDate(endsAt.getUTCDate() + trialDays);

    const panelEmail = this.makePanelEmail(user.name, user.id, user.telegramId ?? undefined, serverId);

    // Деактивируем старые активные подписки перед созданием новой
    await this.prisma.subscription.updateMany({
      where: { vpnUserId: user.id, active: true },
      data: { active: false },
    });

    // Получаем все активные серверы пользователя для деактивации
    const activeUserServers = await this.prisma.userServer.findMany({
      where: {
        vpnUserId: user.id,
        isActive: true,
      },
      include: { server: true },
    });

    // Деактивируем предыдущие активные серверы и удаляем клиентов из старых панелей
    for (const oldUserServer of activeUserServers) {
      // Деактивируем в БД
      await this.prisma.userServer.update({
        where: { id: oldUserServer.id },
        data: { isActive: false },
      });

      // Удаляем клиента из старой панели xray
      if (
        oldUserServer.server.panelBaseUrl &&
        oldUserServer.server.panelUsername &&
        oldUserServer.server.panelPasswordEnc &&
        oldUserServer.server.panelInboundId !== null
      ) {
        try {
          const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
          const oldPanelPassword = SecretBox.decrypt(oldUserServer.server.panelPasswordEnc, secret);
          const oldAuth = await this.xui.login(oldUserServer.server.panelBaseUrl, oldUserServer.server.panelUsername, oldPanelPassword);
          
          if (oldAuth.cookie || oldAuth.token) {
            await this.xui.deleteClientByEmail(
              oldUserServer.server.panelBaseUrl,
              oldAuth,
              oldUserServer.server.panelInboundId,
              oldUserServer.panelEmail,
            );
          }
        } catch (error: any) {
          // Логируем ошибку, но не прерываем процесс
          console.error(`Failed to remove client from old panel ${oldUserServer.server.panelBaseUrl}:`, error);
        }
      }
    }

    // Создаём триал подписку
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
      const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
      const panelPassword = SecretBox.decrypt(server.panelPasswordEnc, secret);
      const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
      if (!auth.cookie && !auth.token) throw new BadRequestException('Panel login failed');

      const expiryTimeMs = endsAt.getTime();
      const flow = server.security === 'REALITY' ? 'xtls-rprx-vision' : '';

      // Проверяем, существует ли уже UserServer для этого сервера
      const existingUserServer = await this.prisma.userServer.findFirst({
        where: {
          vpnUserId: user.id,
          serverId,
        },
      });

      if (existingUserServer) {
        // Если сервер уже добавлен, просто активируем его
        await this.prisma.userServer.update({
          where: { id: existingUserServer.id },
          data: {
            isActive: true,
            active: true,
            panelEmail,
          },
        });

        // Обновляем клиента в панели
        await this.xui.updateClientByEmail(server.panelBaseUrl, auth, server.panelInboundId, panelEmail, {
          id: user.uuid,
          enable: true,
          expiryTime: expiryTimeMs,
          flow,
          tgId: user.telegramId ?? '',
          subId: user.name,
          comment: user.name,
        });
      } else {
        // Если сервер новый, добавляем клиента в панель
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

        // Создаём запись UserServer
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

      // Обновляем пользователя: добавляем serverId и expiresAt
      const updated = await this.prisma.vpnUser.update({
        where: { id: user.id },
        data: {
          serverId, // Legacy
          panelEmail,
          expiresAt: endsAt,
        },
        include: { server: true, userServers: { include: { server: true } } },
      });

      return updated;
    } catch (e) {
      // Rollback при ошибке
      await this.prisma.userServer.deleteMany({ where: { vpnUserId: user.id } }).catch(() => undefined);
      await this.prisma.subscription.deleteMany({ where: { vpnUserId: user.id, active: true } }).catch(() => undefined);
      throw e;
    }
  }

  async getConfig(id: string) {
    const user = await this.prisma.vpnUser.findUnique({
      where: { id },
      include: {
        userServers: {
          where: { active: true, isActive: true }, // Только текущая активная локация
          include: { server: true },
        },
        server: true, // Legacy для обратной совместимости
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const userName = user.name || user.telegramId || 'User';
    const configs: Array<{ url: string; serverName: string }> = [];

    // Генерируем конфиг только для активной локации
    for (const us of user.userServers) {
      const s = us.server;
      const serverName = s.name || s.host || 'Server';
      const tag = encodeURIComponent(`${serverName} - ${userName}`);

      let url: string;

      if (s.security === 'REALITY') {
        if (!s.sni) continue; // Пропускаем серверы без SNI
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
      } else if (s.security === 'TLS') {
        const params = new URLSearchParams({
          type: s.transport === 'WS' ? 'ws' : 'tcp',
          encryption: 'none',
          security: 'tls',
          sni: s.sni ?? s.host,
        });
        // Для TCP + TLS добавляем flow
        if (s.transport === 'TCP') {
          params.set('flow', 'xtls-rprx-vision');
        }
        if (s.transport === 'WS') {
          if (s.path) params.set('path', s.path);
          params.set('host', s.host);
        }
        url = `vless://${user.uuid}@${s.host}:${s.port}?${params.toString()}#${tag}`;
      } else {
        // NONE
        const params = new URLSearchParams({
          type: s.transport === 'WS' ? 'ws' : 'tcp',
          encryption: 'none',
          security: 'none',
        });
        if (s.transport === 'WS') {
          if (s.path) params.set('path', s.path);
          params.set('host', s.host);
        }
        url = `vless://${user.uuid}@${s.host}:${s.port}?${params.toString()}#${tag}`;
      }

      configs.push({ url, serverName });
    }

    // Если нет активных серверов через UserServer, используем legacy serverId (для обратной совместимости)
    if (configs.length === 0 && user.serverId && user.server) {
      const s = user.server;
      const serverName = s.name || s.host || 'Server';
      const tag = encodeURIComponent(`${serverName} - ${userName}`);

      let url: string;
      if (s.security === 'REALITY') {
        if (!s.sni) throw new BadRequestException('Server SNI is missing');
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
      } else if (s.security === 'TLS') {
        const params = new URLSearchParams({
          type: s.transport === 'WS' ? 'ws' : 'tcp',
          encryption: 'none',
          security: 'tls',
          sni: s.sni ?? s.host,
        });
        // Для TCP + TLS добавляем flow
        if (s.transport === 'TCP') {
          params.set('flow', 'xtls-rprx-vision');
        }
        if (s.transport === 'WS') {
          if (s.path) params.set('path', s.path);
          params.set('host', s.host);
        }
        url = `vless://${user.uuid}@${s.host}:${s.port}?${params.toString()}#${tag}`;
      } else {
        const params = new URLSearchParams({
          type: s.transport === 'WS' ? 'ws' : 'tcp',
          encryption: 'none',
          security: 'none',
        });
        if (s.transport === 'WS') {
          if (s.path) params.set('path', s.path);
          params.set('host', s.host);
        }
        url = `vless://${user.uuid}@${s.host}:${s.port}?${params.toString()}#${tag}`;
      }
      configs.push({ url, serverName });
    }

    if (configs.length === 0) {
      throw new BadRequestException('User has no active servers');
    }

    // Возвращаем массив конфигов (для обратной совместимости, если один - можно вернуть как раньше)
    return { configs };
  }

  private makePanelEmail(name: string, userId: string, telegramId?: string, serverId?: string) {
    // panel email should be unique & stable and preferably readable
    // Для множественных серверов добавляем префикс сервера для уникальности
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

  async update(id: string, dto: UpdateUserDto) {
    const existing = await this.prisma.vpnUser.findUnique({
      where: { id },
      include: {
        server: true, // Legacy
        userServers: {
          include: { server: true },
        },
      },
    });
    if (!existing) throw new NotFoundException('User not found');

    const nextName = (dto.name ?? existing.name).trim();
    const nextTelegramId =
      dto.telegramId === undefined ? existing.telegramId : (dto.telegramId ?? '').trim() || null;
    const nextStatus = dto.status ?? existing.status;
    const nextServerId = dto.serverId ?? existing.serverId;

    // Если меняется сервер — нужно проверить новый сервер и перенести клиента между панелями.
    if (dto.serverId && dto.serverId !== existing.serverId) {
      const newServer = await this.prisma.vpnServer.findUnique({ where: { id: dto.serverId } });
      if (!newServer) throw new NotFoundException('New server not found');
      if (!newServer.panelBaseUrl || !newServer.panelUsername || !newServer.panelPasswordEnc || !newServer.panelInboundId) {
        throw new BadRequestException('New server is not connected to a panel (missing panelBaseUrl/creds/inboundId)');
      }

      // Trial update: set new subscription window from "now"
      const now = new Date();
      const nextExpiresAt =
        dto.trialDays
          ? (() => {
              const endsAt = new Date(now);
              endsAt.setUTCDate(endsAt.getUTCDate() + dto.trialDays!);
              return endsAt;
            })()
          : dto.expiresAt === undefined
            ? existing.expiresAt
            : dto.expiresAt
              ? new Date(dto.expiresAt)
              : null;

      // Удаляем клиента со старого сервера (если был создан через legacy serverId).
      if (existing.panelEmail && existing.server) {
        const oldServer = existing.server;
        if (oldServer.panelBaseUrl && oldServer.panelUsername && oldServer.panelPasswordEnc && oldServer.panelInboundId) {
          try {
            const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
            const oldPanelPassword = SecretBox.decrypt(oldServer.panelPasswordEnc, secret);
            const oldAuth = await this.xui.login(oldServer.panelBaseUrl, oldServer.panelUsername, oldPanelPassword);
            if (oldAuth.cookie || oldAuth.token) {
              await this.xui.deleteClientByEmail(
                oldServer.panelBaseUrl,
                oldAuth,
                oldServer.panelInboundId,
                existing.panelEmail,
              );
            }
          } catch {
            // Best-effort: если не удалось удалить со старого — продолжаем, создадим на новом.
          }
        }
      }

      // Создаём клиента на новом сервере.
      const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
      const newPanelPassword = SecretBox.decrypt(newServer.panelPasswordEnc, secret);
      const newAuth = await this.xui.login(newServer.panelBaseUrl, newServer.panelUsername, newPanelPassword);
      if (!newAuth.cookie && !newAuth.token) throw new BadRequestException('New server panel login failed');

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

      // Обновляем panelEmail если его не было, и serverId.
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
              periodDays: dto.trialDays!,
              startsAt: now,
              endsAt: nextExpiresAt!,
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

    // Trial update: set new subscription window from "now"
    const now = new Date();
    const nextExpiresAt =
      dto.trialDays
        ? (() => {
            const endsAt = new Date(now);
            endsAt.setUTCDate(endsAt.getUTCDate() + dto.trialDays!);
            return endsAt;
          })()
        : dto.expiresAt === undefined
          ? existing.expiresAt
          : dto.expiresAt
            ? new Date(dto.expiresAt)
            : null;

    // If user was provisioned in panel, update panel FIRST (so we don't write DB "success" while panel failed).
    // Обновляем только активную локацию (isActive: true)
    if (existing.panelEmail || existing.userServers?.length) {
      const activeUserServer = await this.prisma.userServer.findFirst({
        where: { vpnUserId: id, active: true, isActive: true },
        include: { server: true },
      });

      if (activeUserServer) {
        const us = activeUserServer;
        const server = us.server;
        if (
          server.panelBaseUrl &&
          server.panelUsername &&
          server.panelPasswordEnc &&
          server.panelInboundId
        ) {
          try {
            const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
            const panelPassword = SecretBox.decrypt(server.panelPasswordEnc, secret);
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
          } catch {
            // Best-effort: продолжаем обновление даже если не удалось обновить панель
          }
        }
      }

      // Legacy: обновляем старый serverId если нет активной UserServer записи
      if (!activeUserServer && existing.panelEmail && existing.server) {
        const server = existing.server;
        if (server.panelBaseUrl && server.panelUsername && server.panelPasswordEnc && server.panelInboundId) {
          const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
          const panelPassword = SecretBox.decrypt(server.panelPasswordEnc, secret);
          const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
          if (!auth.cookie && !auth.token) throw new BadRequestException('Panel login failed');

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

    // Now persist DB changes atomically.
    if (dto.trialDays) {
      await this.prisma.$transaction(async (tx) => {
        await tx.subscription.updateMany({
          where: { vpnUserId: id, active: true },
          data: { active: false },
        });
        await tx.subscription.create({
          data: {
            vpnUserId: id,
            periodDays: dto.trialDays!,
            startsAt: now,
            endsAt: nextExpiresAt!,
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

  async remove(id: string) {
    const user = await this.prisma.vpnUser.findUnique({
      where: { id },
      include: {
        userServers: {
          include: { server: true },
        },
        server: true, // Legacy для обратной совместимости
      },
    });
    if (!user) throw new NotFoundException('User not found');

    // Удаляем клиентов со всех серверов через UserServer
    for (const us of user.userServers) {
      const server = us.server;
      if (
        server.panelBaseUrl &&
        server.panelUsername &&
        server.panelPasswordEnc &&
        server.panelInboundId
      ) {
        try {
          const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
          const panelPassword = SecretBox.decrypt(server.panelPasswordEnc, secret);
          const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
          if (auth.cookie || auth.token) {
            await this.xui.deleteClientByEmail(server.panelBaseUrl, auth, server.panelInboundId, us.panelEmail);
          }
        } catch {
          // Best-effort: продолжаем удаление даже если не удалось удалить из панели
        }
      }
    }

    // Legacy: удаляем со старого serverId если нет UserServer записей
    if (user.userServers.length === 0 && user.panelEmail && user.server) {
      const server = user.server;
      if (
        server.panelBaseUrl &&
        server.panelUsername &&
        server.panelPasswordEnc &&
        server.panelInboundId
      ) {
        try {
          const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
          const panelPassword = SecretBox.decrypt(server.panelPasswordEnc, secret);
          const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
          if (auth.cookie || auth.token) {
            await this.xui.deleteClientByEmail(server.panelBaseUrl, auth, server.panelInboundId, user.panelEmail);
          }
        } catch {
          // Best-effort
        }
      }
    }

    // UserServer записи удалятся каскадно через onDelete: Cascade
    await this.prisma.vpnUser.delete({ where: { id } });
    return { ok: true };
  }

  async addServer(userId: string, serverId: string) {
    const user = await this.prisma.vpnUser.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const server = await this.prisma.vpnServer.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');

    // Проверяем, не добавлен ли уже этот сервер
    const existing = await this.prisma.userServer.findUnique({
      where: { vpnUserId_serverId: { vpnUserId: userId, serverId } },
    });
    if (existing) {
      // Если запись есть но неактивна - активируем
      if (!existing.active) {
        await this.prisma.userServer.update({
          where: { id: existing.id },
          data: { active: true },
        });
        return this.get(userId);
      }
      throw new BadRequestException('Server already added to user');
    }

    if (!server.panelBaseUrl || !server.panelUsername || !server.panelPasswordEnc || !server.panelInboundId) {
      throw new BadRequestException('Server is not connected to a panel (missing panelBaseUrl/creds/inboundId)');
    }

    const panelEmail = this.makePanelEmail(user.name, user.id, user.telegramId ?? undefined, serverId);

    try {
      const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
      const panelPassword = SecretBox.decrypt(server.panelPasswordEnc, secret);
      const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
      if (!auth.cookie && !auth.token) throw new BadRequestException('Panel login failed');

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

      // Деактивируем предыдущую активную локацию (удаляем клиента из панели)
      const previousActive = await this.prisma.userServer.findFirst({
        where: { vpnUserId: userId, isActive: true },
        include: { server: true },
      });

      if (previousActive) {
        const oldServer = previousActive.server;
        if (
          oldServer.panelBaseUrl &&
          oldServer.panelUsername &&
          oldServer.panelPasswordEnc &&
          oldServer.panelInboundId
        ) {
          try {
            const oldSecret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
            const oldPanelPassword = SecretBox.decrypt(oldServer.panelPasswordEnc, oldSecret);
            const oldAuth = await this.xui.login(oldServer.panelBaseUrl, oldServer.panelUsername, oldPanelPassword);
            if (oldAuth.cookie || oldAuth.token) {
              await this.xui.deleteClientByEmail(
                oldServer.panelBaseUrl,
                oldAuth,
                oldServer.panelInboundId,
                previousActive.panelEmail,
              );
            }
          } catch {
            // Best-effort: продолжаем даже если не удалось удалить со старой локации
          }
        }
        // Деактивируем предыдущую активную локацию в БД
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
          isActive: true, // Новая локация становится активной
        },
      });

      return this.get(userId);
    } catch (e) {
      throw e;
    }
  }

  async removeServer(userId: string, serverId: string) {
    const user = await this.prisma.vpnUser.findUnique({
      where: { id: userId },
      include: {
        userServers: {
          where: { active: true },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const userServer = await this.prisma.userServer.findUnique({
      where: { vpnUserId_serverId: { vpnUserId: userId, serverId } },
      include: { server: true },
    });
    if (!userServer) throw new NotFoundException('User server not found');

    // Запрещаем удаление последнего активного сервера
    const activeServersCount = user.userServers.length;
    const hasLegacyServer = user.serverId !== null;
    const totalActiveServers = activeServersCount + (hasLegacyServer ? 1 : 0);

    if (totalActiveServers <= 1) {
      throw new BadRequestException('Cannot remove the last active server. User must have at least one server.');
    }

    const server = userServer.server;
    const wasActive = userServer.isActive;

    if (
      server.panelBaseUrl &&
      server.panelUsername &&
      server.panelPasswordEnc &&
      server.panelInboundId
    ) {
      try {
        const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
        const panelPassword = SecretBox.decrypt(server.panelPasswordEnc, secret);
        const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
        if (auth.cookie || auth.token) {
          await this.xui.deleteClientByEmail(server.panelBaseUrl, auth, server.panelInboundId, userServer.panelEmail);
        }
      } catch {
        // Best-effort: продолжаем удаление даже если не удалось удалить из панели
      }
    }

    await this.prisma.userServer.delete({ where: { id: userServer.id } });

    // Если удалялась активная локация, активируем другую (если есть)
    if (wasActive) {
      const remainingActive = await this.prisma.userServer.findFirst({
        where: { vpnUserId: userId, active: true },
      });
      if (remainingActive) {
        await this.prisma.userServer.update({
          where: { id: remainingActive.id },
          data: { isActive: true },
        });
        // Нужно также создать клиента в панели для новой активной локации
        const newActiveServer = await this.prisma.vpnServer.findUnique({
          where: { id: remainingActive.serverId },
        });
        if (
          newActiveServer &&
          newActiveServer.panelBaseUrl &&
          newActiveServer.panelUsername &&
          newActiveServer.panelPasswordEnc &&
          newActiveServer.panelInboundId
        ) {
          try {
            const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
            const panelPassword = SecretBox.decrypt(newActiveServer.panelPasswordEnc, secret);
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
          } catch {
            // Best-effort: продолжаем даже если не удалось создать клиента в панели
          }
        }
      }
    }

    return this.get(userId);
  }

  async activateServer(userId: string, serverId: string) {
    const user = await this.prisma.vpnUser.findUnique({
      where: { id: userId },
      include: {
        userServers: {
          where: { active: true },
          include: { server: true },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const targetUserServer = await this.prisma.userServer.findUnique({
      where: { vpnUserId_serverId: { vpnUserId: userId, serverId } },
      include: { server: true },
    });
    if (!targetUserServer) throw new NotFoundException('User server not found');
    if (!targetUserServer.active) throw new BadRequestException('Server is not active');

    const targetServer = targetUserServer.server;

    // Находим текущую активную локацию
    const currentActive = user.userServers.find((us) => us.isActive);
    if (currentActive && currentActive.id === targetUserServer.id) {
      // Уже активна
      return this.get(userId);
    }

    // Деактивируем предыдущую активную локацию (удаляем клиента из панели)
    if (currentActive) {
      const oldServer = currentActive.server;
      if (
        oldServer.panelBaseUrl &&
        oldServer.panelUsername &&
        oldServer.panelPasswordEnc &&
        oldServer.panelInboundId
      ) {
        try {
          const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
          const oldPanelPassword = SecretBox.decrypt(oldServer.panelPasswordEnc, secret);
          const oldAuth = await this.xui.login(oldServer.panelBaseUrl, oldServer.panelUsername, oldPanelPassword);
          if (oldAuth.cookie || oldAuth.token) {
            await this.xui.deleteClientByEmail(
              oldServer.panelBaseUrl,
              oldAuth,
              oldServer.panelInboundId,
              currentActive.panelEmail,
            );
          }
        } catch {
          // Best-effort: продолжаем даже если не удалось удалить со старой локации
        }
      }
    }

    // Активируем новую локацию (создаём клиента в панели)
    if (!targetServer.panelBaseUrl || !targetServer.panelUsername || !targetServer.panelPasswordEnc || !targetServer.panelInboundId) {
      throw new BadRequestException('Target server is not connected to a panel');
    }

    const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
    const panelPassword = SecretBox.decrypt(targetServer.panelPasswordEnc, secret);
    const auth = await this.xui.login(targetServer.panelBaseUrl, targetServer.panelUsername, panelPassword);
    if (!auth.cookie && !auth.token) throw new BadRequestException('Panel login failed');

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

    // Обновляем флаги активности в БД
    await this.prisma.$transaction(async (tx) => {
      // Деактивируем все локации пользователя
      await tx.userServer.updateMany({
        where: { vpnUserId: userId },
        data: { isActive: false },
      });
      // Активируем выбранную локацию
      await tx.userServer.update({
        where: { id: targetUserServer.id },
        data: { isActive: true },
      });
    });

    return this.get(userId);
  }

  async getTraffic(userId: string) {
    const user = await this.prisma.vpnUser.findUnique({
      where: { id: userId },
      include: {
        userServers: {
          where: { active: true, isActive: true },
          include: { server: true },
        },
        server: true, // Legacy
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const trafficData: Array<{
      serverId: string;
      serverName: string;
      panelEmail: string;
      up: number;
      down: number;
      total: number;
      reset: number;
      lastOnline: number;
    }> = [];

    // Получаем трафик для активной локации
    const activeUserServer = user.userServers.find((us) => us.isActive);
    if (activeUserServer) {
      const server = activeUserServer.server;
      if (
        server.panelBaseUrl &&
        server.panelUsername &&
        server.panelPasswordEnc &&
        server.panelInboundId
      ) {
        try {
          const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
          const panelPassword = SecretBox.decrypt(server.panelPasswordEnc, secret);
          const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
          if (auth.cookie || auth.token) {
            const traffic = await this.xui.getClientTraffic(
              server.panelBaseUrl,
              auth,
              server.panelInboundId,
              activeUserServer.panelEmail,
            );
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
        } catch (e: any) {
          // Best-effort: если не удалось получить трафик, продолжаем
        }
      }
    } else if (user.panelEmail && user.server) {
      // Legacy: получаем трафик для старого serverId
      const server = user.server;
      if (
        server.panelBaseUrl &&
        server.panelUsername &&
        server.panelPasswordEnc &&
        server.panelInboundId
      ) {
        try {
          const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
          const panelPassword = SecretBox.decrypt(server.panelPasswordEnc, secret);
          const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
          if (auth.cookie || auth.token) {
            const traffic = await this.xui.getClientTraffic(
              server.panelBaseUrl,
              auth,
              server.panelInboundId,
              user.panelEmail,
            );
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
        } catch (e: any) {
          // Best-effort
        }
      }
    }

    return { traffic: trafficData };
  }

  async resetTraffic(userId: string) {
    const user = await this.prisma.vpnUser.findUnique({
      where: { id: userId },
      include: {
        userServers: {
          where: { active: true, isActive: true },
          include: { server: true },
        },
        server: true, // Legacy
      },
    });
    if (!user) throw new NotFoundException('User not found');

    // Сбрасываем трафик для активной локации
    const activeUserServer = user.userServers.find((us) => us.isActive);
    if (activeUserServer) {
      const server = activeUserServer.server;
      if (
        server.panelBaseUrl &&
        server.panelUsername &&
        server.panelPasswordEnc &&
        server.panelInboundId
      ) {
        const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
        const panelPassword = SecretBox.decrypt(server.panelPasswordEnc, secret);
        const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
        if (!auth.cookie && !auth.token) throw new BadRequestException('Panel login failed');

        await this.xui.resetClientTraffic(
          server.panelBaseUrl,
          auth,
          server.panelInboundId,
          activeUserServer.panelEmail,
        );
        return { ok: true };
      }
    } else if (user.panelEmail && user.server) {
      // Legacy: сбрасываем трафик для старого serverId
      const server = user.server;
      if (
        server.panelBaseUrl &&
        server.panelUsername &&
        server.panelPasswordEnc &&
        server.panelInboundId
      ) {
        const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
        const panelPassword = SecretBox.decrypt(server.panelPasswordEnc, secret);
        const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
        if (!auth.cookie && !auth.token) throw new BadRequestException('Panel login failed');

        await this.xui.resetClientTraffic(server.panelBaseUrl, auth, server.panelInboundId, user.panelEmail);
        return { ok: true };
      }
    }

    throw new BadRequestException('User has no active server connected to panel');
  }
}

