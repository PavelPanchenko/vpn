import { BadRequestException, Injectable, Logger, NotFoundException, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type VpnUser } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { XuiService } from '../xui/xui.service';
import { XrayStatsService } from '../xui/xray-stats.service';
import { SecretBox } from '../../common/crypto/secret-box';
import { addDaysUtc } from '../../common/utils/date.utils';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { MigratePanelEmailsDto } from './dto/migrate-panel-emails.dto';

/** Единый формат panelEmail: только uuid и serverId. Одинаковый при создании и при поиске. */
function buildPanelEmail(uuid: string, serverId: string): string {
  const prefix = serverId.slice(0, 8);
  return `${uuid}@vpn-${prefix}`;
}

function sanitizeTelegramUsername(v: string): string {
  // Telegram username: a-zA-Z0-9_ (но на всякий случай чистим)
  const s = String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return s.slice(0, 20);
}

/** Совпадает ли panelEmail с кем-то из списка онлайн. Xray возвращает "user>>>email>>>online". */
function isUserOnline(onlineList: string[], panelEmail: string): boolean {
  if (!Array.isArray(onlineList) || !panelEmail) return false;
  const email = panelEmail.trim();
  const expected = `user>>>${email}>>>online`;
  for (const item of onlineList) {
    const s = String(item ?? '').trim();
    if (s === expected || s === email || s === `user>>>${email}` || s.endsWith(`>>>${email}>>>online`) || s.toLowerCase() === expected.toLowerCase()) return true;
  }
  return false;
}

function buildReadablePanelEmail(args: { telegramId: string; telegramUsername?: string | null; uuid: string; serverId: string }): string {
  const prefix = args.serverId.slice(0, 8);
  const base = sanitizeTelegramUsername(args.telegramUsername ?? '') || 'tg';
  // telegramId уникальный и стабильный — делаем его обязательной частью email
  return `${base}-${args.telegramId}@vpn-${prefix}`;
}

/** Лимит одновременных подключений (устройств) в панели. DB → env → default 2. */
async function getPanelClientLimitIp(prisma: PrismaService, config: ConfigService): Promise<number> {
  const cfg = await prisma.botConfig.findFirst({ where: { active: true }, orderBy: { createdAt: 'desc' }, select: { panelClientLimitIp: true } });
  if (cfg?.panelClientLimitIp != null) return cfg.panelClientLimitIp;
  const v = config.get<string>('PANEL_CLIENT_LIMIT_IP');
  if (v == null || v === '') return 2;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : 2;
}

type EnsurePanelClientOptions = { expiryTime?: number; enable?: boolean; limitIp?: number };

type TelegramNotifier = {
  sendAccessDaysChangedNotification: (telegramId: string | null, expiresAt: Date | null) => Promise<void>;
};

const TRAFFIC_CACHE_TTL_MS = 5000;

/** Интервал обновления lastOnlineAt (мс). */
const ONLINE_POLL_INTERVAL_MS = 60_000;

@Injectable()
export class UsersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UsersService.name);
  private readonly trafficCache = new Map<string, { result: Awaited<ReturnType<UsersService['getTraffic']>>; cachedAt: number }>();
  private onlinePollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly xui: XuiService,
    private readonly xrayStats: XrayStatsService,
    private readonly config: ConfigService,
    @Inject('TELEGRAM_NOTIFIER') private readonly telegramBot: TelegramNotifier,
  ) {}

  onModuleInit() {
    this.onlinePollTimer = setInterval(() => {
      this.updateOnlineTimestamps().catch((err) =>
        this.logger.error('Failed to update online timestamps:', err),
      );
    }, ONLINE_POLL_INTERVAL_MS);
    this.logger.log(`Online polling started (every ${ONLINE_POLL_INTERVAL_MS / 1000}s)`);
  }

  onModuleDestroy() {
    if (this.onlinePollTimer) {
      clearInterval(this.onlinePollTimer);
      this.onlinePollTimer = null;
    }
  }

  /** Обновляет lastOnlineAt для всех пользователей, которые сейчас онлайн. */
  async updateOnlineTimestamps(): Promise<void> {
    const onlineIds = await this.getOnlineUserIds();
    if (onlineIds.length === 0) return;
    await this.prisma.vpnUser.updateMany({
      where: { id: { in: onlineIds } },
      data: { lastOnlineAt: new Date() },
    });
  }

  private async getActiveBotToken(): Promise<string | null> {
    const cfg = await this.prisma.botConfig.findFirst({ where: { active: true }, orderBy: { createdAt: 'desc' } });
    if (!cfg) return null;
    const secret = this.config.get<string>('PANEL_CRED_SECRET') || '';
    if (!secret) return null;
    try {
      return SecretBox.decrypt(cfg.tokenEnc, secret);
    } catch {
      return null;
    }
  }

  private async tryFetchTelegramUsername(args: { botToken: string | null; telegramId: string }): Promise<string | null> {
    if (!args.botToken) return null;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 7_000);
    try {
      const url =
        `https://api.telegram.org/bot${encodeURIComponent(args.botToken)}/getChat?chat_id=${encodeURIComponent(args.telegramId)}`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return null;
      const json = (await res.json()) as any;
      const username = String(json?.result?.username ?? '').trim();
      return username ? username : null;
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  }

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
      if (existing) {
        await this.clearBotBlockedAndMaybeName(existing.id, name, existing.name);
        if (name && name !== 'User' && existing.name !== name) (existing as any).name = name;
        return existing;
      }

      const created = await this.createFromTelegram(telegramId, name);
      return this.prisma.vpnUser.findUniqueOrThrow({ where: { id: created.id }, include });
    }

    const existing = await this.findByTelegramId(telegramId);
    if (existing) {
      await this.clearBotBlockedAndMaybeName(existing.id, name, existing.name);
      if (name && name !== 'User' && existing.name !== name) (existing as any).name = name;
      return existing;
    }
    return this.createFromTelegram(telegramId, name);
  }

  /** Сбрасывает botBlockedAt при /start; при необходимости обновляет name. */
  private async clearBotBlockedAndMaybeName(userId: string, newName: string, currentName: string) {
    const data: { botBlockedAt: null; name?: string } = { botBlockedAt: null };
    if (newName && newName !== 'User' && newName !== currentName) data.name = newName;
    await this.prisma.vpnUser.update({ where: { id: userId }, data }).catch(() => {});
  }

  /** Количество пользователей (поиск q, статус, сервер — те же условия, что и list). */
  async count(args?: { q?: string; status?: string; serverId?: string }): Promise<number> {
    const q = (args?.q ?? '').trim();
    const status = (args?.status ?? '').trim();
    const serverId = (args?.serverId ?? '').trim();
    const where: Prisma.VpnUserWhereInput = {};
    if (status) (where as any).status = status as any;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { telegramId: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (serverId) {
      where.OR = [
        ...(where.OR ?? []),
        { serverId },
        { userServers: { some: { isActive: true, serverId } } },
      ];
    }
    return this.prisma.vpnUser.count({ where });
  }

  /** Пометить пользователя как «бот заблокирован» (chat not found / bot was blocked). */
  async markBotBlockedByTelegramId(telegramId: string): Promise<void> {
    await this.prisma.vpnUser
      .updateMany({ where: { telegramId }, data: { botBlockedAt: new Date() } })
      .catch(() => {});
  }

  /** Единая точка: добавить/обновить клиента на панели. */
  private async ensurePanelClient(
    server: { panelBaseUrl: string | null; panelUsername: string | null; panelPasswordEnc: string | null; panelInboundId: number | null; security?: string },
    userUuid: string,
    panelEmail: string,
    options?: EnsurePanelClientOptions,
  ): Promise<void> {
    if (!server.panelBaseUrl || !server.panelUsername || !server.panelPasswordEnc || server.panelInboundId == null) {
      throw new BadRequestException('Server is not connected to panel (missing panel settings)');
    }
    const secret = this.config.get<string>('PANEL_CRED_SECRET');
    if (!secret) throw new BadRequestException('PANEL_CRED_SECRET is not configured');

    const panelPassword = SecretBox.decrypt(server.panelPasswordEnc, secret);
    const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
    if (!auth.cookie && !auth.token) {
      throw new BadRequestException('Panel login failed');
    }

    const expiryTime = options?.expiryTime ?? 0;
    const limitIp = options?.limitIp ?? await getPanelClientLimitIp(this.prisma, this.config);

    try {
      await this.xui.addClient(server.panelBaseUrl, auth, server.panelInboundId, {
        id: userUuid,
        email: panelEmail,
        flow: server.security === 'REALITY' ? 'xtls-rprx-vision' : '',
        expiryTime: expiryTime > 0 ? expiryTime : undefined,
        enable: options?.enable,
        limitIp: limitIp > 0 ? limitIp : undefined,
      });
    } catch (addErr: any) {
      // idempotency: если клиент уже есть — обновим expiry/enable/limitIp (в т.ч. если email совпал)
      const msg = String(addErr?.message ?? addErr);
      if (addErr instanceof BadRequestException && msg.includes('already exists')) {
        await this.xui.updateClient(server.panelBaseUrl, auth, server.panelInboundId, panelEmail, {
          ...(options?.enable !== undefined && { enable: options.enable }),
          ...(options?.expiryTime !== undefined && { expiryTime: options.expiryTime }),
          ...(limitIp > 0 && { limitIp }),
          totalGB: 0, // неограниченный трафик, лимит только по сроку
        });
      } else {
        this.logger.error(`ensurePanelClient failed for ${panelEmail}: ${msg}`);
        throw addErr;
      }
    }
  }

  /** Единая точка: привязать пользователя к серверу (БД + опционально клиент на панели). */
  private async attachUserToServer(
    userId: string,
    serverId: string,
    options: { isActive: boolean; addToPanel: boolean; expiryTime?: number; telegramUsername?: string | null },
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
    const panelEmail =
      user.telegramId
        ? buildReadablePanelEmail({
            telegramId: user.telegramId,
            telegramUsername: options.telegramUsername ?? null,
            uuid: user.uuid,
            serverId,
          })
        : buildPanelEmail(user.uuid, serverId);
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
        data: { expiresAt: sub.endsAt, status: nextStatus, expiryReminderSentAt: null },
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

  async list(args?: {
    offset?: number;
    limit?: number;
    q?: string;
    status?: string;
    serverId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    await this.refreshExpiredStatuses();
    const offset = Math.max(0, Number(args?.offset ?? 0) || 0);
    const limitRaw = Number(args?.limit ?? 50);
    const limit = Math.min(1000, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));
    const q = (args?.q ?? '').trim();
    const status = (args?.status ?? '').trim();
    const serverId = (args?.serverId ?? '').trim();
    const order = args?.sortOrder === 'asc' ? 'asc' : 'desc';

    const where: Prisma.VpnUserWhereInput = {};
    if (status) (where as any).status = status as any;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { telegramId: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (serverId) {
      where.OR = [
        ...(where.OR ?? []),
        { serverId },
        { userServers: { some: { isActive: true, serverId } } },
      ];
    }

    const sortBy = (args?.sortBy ?? 'createdAt').toLowerCase();
    const orderBy: Prisma.VpnUserOrderByWithRelationInput =
      sortBy === 'name'
        ? { name: order }
        : sortBy === 'expiresat'
          ? { expiresAt: order }
          : sortBy === 'status'
            ? { status: order }
            : sortBy === 'lastonlineat'
              ? { lastOnlineAt: order }
              : sortBy === 'servername'
                ? { server: { name: order } }
                : { createdAt: order };

    return this.prisma.vpnUser.findMany({
      orderBy,
      where,
      skip: offset,
      take: limit,
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

  /**
   * Статус онлайн пользователя по активному серверу (Xray GetAllOnlineUsers). Без статистики трафика.
   * Ответ кэшируется на 5 с.
   */
  async getTraffic(userId: string): Promise<{
    traffic: { online: boolean; serverId?: string; serverName?: string; lastOnlineAt?: Date | null } | null;
    error?: string;
  }> {
    const cached = this.trafficCache.get(userId);
    if (cached && Date.now() - cached.cachedAt < TRAFFIC_CACHE_TTL_MS) {
      return cached.result;
    }
    const user = await this.prisma.vpnUser.findUnique({
      where: { id: userId },
      include: {
        userServers: { include: { server: true }, orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }] },
      },
    });
    if (!user) return { traffic: null, error: 'User not found' };
    const sorted = [...(user.userServers || [])].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    const us = sorted[0] ?? null;
    if (!us) {
      return { traffic: null, error: 'No servers linked to user' };
    }
    const server = us.server;
    const panelEmail = us.panelEmail;
    if (!server.xrayStatsHost) {
      return {
        traffic: null,
        error: 'Set Xray Stats host and port in server settings',
      };
    }

    const port = server.xrayStatsPort ?? 8080;
    const timeoutMs = 10000;
    try {
      const onlineUsers = await Promise.race([
        this.xrayStats.getOnlineUsers(server.xrayStatsHost, port),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Xray API timeout')), timeoutMs);
        }),
      ]);
      const online = isUserOnline(onlineUsers, panelEmail);
      const result = {
        traffic: { online, serverId: server.id, serverName: server.name, lastOnlineAt: user.lastOnlineAt },
      };
      this.trafficCache.set(userId, { result, cachedAt: Date.now() });
      return result;
    } catch (e) {
      const msg = (e as Error).message;
      this.logger.warn(`getTraffic for user ${userId} server ${server.id}: ${msg}`);
      return { traffic: null, error: `${server.name}: ${msg}` };
    }
  }

  /** Сбросить кэш трафика при смене активного сервера (чтобы следующий запрос получил свежие данные с нового сервера). */
  clearTrafficCache(userId: string): void {
    this.trafficCache.delete(userId);
  }

  /**
   * Список id пользователей, которые сейчас онлайн (хотя бы на одном из своих серверов).
   * По каждому серверу с xrayStatsHost вызывается GetAllOnlineUsers.
   */
  async getOnlineUserIds(): Promise<string[]> {
    const servers = await this.prisma.vpnServer.findMany({
      where: { xrayStatsHost: { not: null } },
      select: { id: true, xrayStatsHost: true, xrayStatsPort: true },
    });
    const onlineUserIds = new Set<string>();
    const timeoutMs = 8000;
    for (const server of servers) {
      const host = server.xrayStatsHost!;
      const port = server.xrayStatsPort ?? 8080;
      try {
        const emails = await Promise.race([
          this.xrayStats.getOnlineUsers(host, port),
          new Promise<string[]>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), timeoutMs),
          ),
        ]);
        const userServers = await this.prisma.userServer.findMany({
          where: { serverId: server.id },
          select: { vpnUserId: true, panelEmail: true },
        });
        for (const us of userServers) {
          if (isUserOnline(emails, us.panelEmail)) {
            onlineUserIds.add(us.vpnUserId);
          }
        }
      } catch {
        // один сервер недоступен — пропускаем
      }
    }
    return Array.from(onlineUserIds);
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

    try {
      await this.attachUserToServer(user.id, dto.serverId, {
        isActive: true,
        addToPanel: true,
        expiryTime: trialEndsAt ? trialEndsAt.getTime() : undefined,
      });
    } catch (e) {
      // Если панель не создалась — не оставляем "битого" пользователя без клиента.
      try {
        await this.prisma.vpnUser.delete({ where: { id: user.id } });
      } catch {
        // ignore
      }
      throw e;
    }
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
      include: { server: true, userServers: { include: { server: true } } },
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

    if (effectiveExpiresAt !== undefined) {
      updates.expiresAt = effectiveExpiresAt;
      updates.expiryReminderSentAt = null; // чтобы перед новым сроком отправилось новое напоминание
    }
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
      // Если админ меняет expiresAt, но не присылает status — приводим статус к expiresAt.
      if (dto.status == null && effectiveExpiresAt !== undefined) {
        const computedStatus: 'NEW' | 'ACTIVE' | 'BLOCKED' | 'EXPIRED' =
          user.status === 'BLOCKED'
            ? 'BLOCKED'
            : effectiveExpiresAt === null
              ? 'ACTIVE'
              : effectiveExpiresAt.getTime() < now.getTime()
                ? 'EXPIRED'
                : 'ACTIVE';
        updates.status = computedStatus;
      }
      await this.prisma.vpnUser.update({ where: { id }, data: updates });
    }

    const expiryTime =
      effectiveExpiresAt === undefined
        ? undefined
        : effectiveExpiresAt
          ? effectiveExpiresAt.getTime()
          : 0;
    const statusForPanel =
      dto.status ??
      (effectiveExpiresAt !== undefined
        ? (user.status === 'BLOCKED'
            ? 'BLOCKED'
            : effectiveExpiresAt === null
              ? 'ACTIVE'
              : effectiveExpiresAt.getTime() < now.getTime()
                ? 'EXPIRED'
                : 'ACTIVE')
        : user.status);
    const enable =
      dto.status !== undefined || effectiveExpiresAt !== undefined
        ? statusForPanel === 'ACTIVE'
        : undefined;
    const shouldSyncPanel = expiryTime !== undefined || enable !== undefined;

    const panelTargets: Array<{ server: any; email: string }> = [];
    if (user.userServers?.length) {
      for (const us of user.userServers) {
        if (us.panelEmail && us.server) panelTargets.push({ server: us.server, email: us.panelEmail });
      }
    }
    if (panelTargets.length === 0 && user.server && user.panelEmail) {
      panelTargets.push({ server: user.server, email: user.panelEmail });
    }
    if (shouldSyncPanel && panelTargets.length > 0) {
      const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
      for (const { server, email } of panelTargets) {
        if (!server?.panelBaseUrl || !server?.panelUsername || !server?.panelPasswordEnc || server?.panelInboundId == null) continue;
        try {
          const panelPassword = SecretBox.decrypt(server.panelPasswordEnc, secret);
          const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
          if (auth.cookie || auth.token) {
            const limitIp = await getPanelClientLimitIp(this.prisma, this.config);
            await this.xui.updateClient(server.panelBaseUrl, auth, server.panelInboundId, email, {
              ...(expiryTime !== undefined && { expiryTime }),
              ...(enable !== undefined && { enable }),
              ...(limitIp > 0 && { limitIp }),
            });
          }
        } catch (e: any) {
          this.logger.warn(`update: panel sync failed for ${email} — ${e?.message ?? e}`);
        }
      }
    }
    if (effectiveExpiresAt !== undefined && user.telegramId) {
      this.telegramBot
        .sendAccessDaysChangedNotification(user.telegramId, effectiveExpiresAt ?? null)
        .catch(() => {});
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

  async createFromTelegram(telegramId: string, name: string, telegramLanguageCode?: string | null) {
    const uuid = randomUUID();
    const panelEmail = `${uuid}@vpn`;
    try {
      const user = await this.prisma.vpnUser.create({
        data: {
          name,
          telegramId,
          telegramLanguageCode: telegramLanguageCode || null,
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

  /**
   * Сохраняем язык Telegram-клиента (ctx.from.language_code) для локализации уведомлений,
   * которые отправляются вне контекста сообщения (webhook/cron/admin).
   */
  async updateTelegramLanguageCodeByTelegramId(telegramId: string, telegramLanguageCode?: string | null) {
    const code = String(telegramLanguageCode ?? '').trim();
    if (!code) return;
    try {
      await this.prisma.vpnUser.updateMany({
        where: { telegramId, telegramLanguageCode: { not: code } },
        data: { telegramLanguageCode: code },
      });
    } catch {
      // best-effort: язык не критичен для бизнес-логики
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
    const s = activeUs?.server ?? user.server;
    if (!s) return { configs };

    // Самовосстановление клиента в панели:
    // если админ удалил клиента вручную, при выдаче конфига мы пересоздадим/обновим его (idempotent).
    // Подписку не меняем — только техническую реализацию доступа.
    if (s.panelBaseUrl && s.panelUsername && s.panelPasswordEnc && s.panelInboundId != null) {
      const panelEmail =
        activeUs?.panelEmail ??
        user.panelEmail ??
        buildPanelEmail(user.uuid, s.id);

      const now = Date.now();
      const sub = await this.syncExpiresAtWithActiveSubscription(userId);
      const expiryTime =
        sub?.endsAt?.getTime() ??
        (user.expiresAt ? user.expiresAt.getTime() : 0);
      const enable = expiryTime > now;

      await this.ensurePanelClient(s as any, user.uuid, panelEmail, {
        expiryTime: expiryTime > 0 ? expiryTime : undefined,
        enable,
      });
    }

    const url = this.buildVlessUrl(s as any, user.uuid, (s as any).sni ?? null, (s as any).path ?? null);
    configs.push({ url, serverName: (s as any).name });
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
        telegramUsername: null,
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
      telegramUsername: null,
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

  async addServerAndTrialWithUsername(userId: string, serverId: string, trialDays: number, telegramUsername?: string | null) {
    // DRY: обёртка для бота, чтобы можно было прокинуть username в формат panelEmail.
    // Вся логика trial остаётся в addServerAndTrial; здесь переиспользуем attach на ветках, где создаётся связь.
    // Пока используем простую стратегию: если связь уже есть — fallback к старому поведению.
    const existing = await this.prisma.userServer.findUnique({
      where: { vpnUserId_serverId: { vpnUserId: userId, serverId } },
    });
    if (existing) return this.addServerAndTrial(userId, serverId, trialDays);

    // Повторяем логику addServerAndTrial только в части attach с username:
    const user = await this.prisma.vpnUser.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

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
        telegramUsername: telegramUsername ?? null,
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
      telegramUsername: telegramUsername ?? null,
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

  async migratePanelEmails(dto: MigratePanelEmailsDto) {
    const dryRun = dto.dryRun ?? true;
    const hardLimit = dto.limit ?? null;

    const botToken = await this.getActiveBotToken();
    const secret = this.config.get<string>('PANEL_CRED_SECRET') || '';

    const serverAuthCache = new Map<string, { cookie?: string; token?: string }>();
    const usernameCache = new Map<string, string | null>();

    let processed = 0;
    let renamed = 0;
    let skipped = 0;
    let failed = 0;

    const details: Array<{ userServerId: string; oldEmail: string; newEmail: string; action: string; error?: string }> = [];

    let cursor: { id: string } | undefined;
    while (true) {
      const take = 200;
      const batch = await this.prisma.userServer.findMany({
        take,
        ...(cursor ? { skip: 1, cursor } : {}),
        orderBy: { id: 'asc' },
        include: {
          server: true,
          vpnUser: { select: { id: true, uuid: true, telegramId: true, expiresAt: true, status: true, panelEmail: true, serverId: true } },
        },
      });
      if (batch.length === 0) break;
      cursor = { id: batch[batch.length - 1].id };

      for (const us of batch) {
        if (hardLimit != null && processed >= hardLimit) break;
        processed++;

        const user = us.vpnUser as any;
        const server = us.server as any;
        const telegramId = String(user?.telegramId ?? '').trim();
        if (!telegramId) {
          skipped++;
          continue;
        }

        if (!server?.panelBaseUrl || !server?.panelUsername || !server?.panelPasswordEnc || server?.panelInboundId == null) {
          skipped++;
          continue;
        }

        let username: string | null;
        if (usernameCache.has(telegramId)) {
          username = usernameCache.get(telegramId)!;
        } else {
          username = await this.tryFetchTelegramUsername({ botToken, telegramId });
          usernameCache.set(telegramId, username);
        }

        let newEmail = buildReadablePanelEmail({
          telegramId,
          telegramUsername: username,
          uuid: user.uuid,
          serverId: server.id,
        });

        const oldEmail = us.panelEmail;
        if (newEmail === oldEmail) {
          skipped++;
          continue;
        }

        // DB uniqueness guard (на случай коллизий/ручных правок)
        const exists = await this.prisma.userServer.findUnique({ where: { panelEmail: newEmail } });
        if (exists && exists.id !== us.id) {
          const suffix = String(user.uuid).replace(/-/g, '').slice(0, 4);
          newEmail = newEmail.replace(/^([^@]+)@/, `$1-${suffix}@`);
        }

        if (dryRun) {
          renamed++;
          if (details.length < 50) details.push({ userServerId: us.id, oldEmail, newEmail, action: 'dry_run' });
          continue;
        }

        try {
          let auth = serverAuthCache.get(server.id);
          if (!auth) {
            if (!secret) throw new Error('PANEL_CRED_SECRET missing');
            const panelPassword = SecretBox.decrypt(server.panelPasswordEnc, secret);
            auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
            serverAuthCache.set(server.id, auth);
          }

          const expiryTime = user.expiresAt ? new Date(user.expiresAt).getTime() : 0;
          const enable = expiryTime === 0 ? true : expiryTime > Date.now();

          try {
            await this.xui.updateClient(server.panelBaseUrl, auth, server.panelInboundId, oldEmail, { email: newEmail });
          } catch (e: any) {
            const msg = String(e?.message ?? e);
            if (msg.includes('Client not found')) {
              // Клиента могли удалить руками — восстановим под новым email, чтобы не ломать выдачу конфига.
              await this.ensurePanelClient(server, user.uuid, newEmail, {
                expiryTime: expiryTime > 0 ? expiryTime : undefined,
                enable,
              });
            } else {
              throw e;
            }
          }

          // Обновляем БД только после успешной операции на панели
          await this.prisma.userServer.update({ where: { id: us.id }, data: { panelEmail: newEmail } });
          if (user.panelEmail === oldEmail && user.serverId === server.id) {
            await this.prisma.vpnUser.update({ where: { id: user.id }, data: { panelEmail: newEmail } });
          }

          renamed++;
          if (details.length < 50) details.push({ userServerId: us.id, oldEmail, newEmail, action: 'renamed' });
        } catch (e: any) {
          failed++;
          if (details.length < 50) {
            details.push({ userServerId: us.id, oldEmail, newEmail, action: 'failed', error: String(e?.message ?? e) });
          }
        }
      }

      if (hardLimit != null && processed >= hardLimit) break;
    }

    return { ok: true, dryRun, processed, renamed, skipped, failed, details };
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
    this.clearTrafficCache(userId);
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

  /**
   * Находит пользователей, у которых подписка истекает примерно через сутки (окно 23–25 ч),
   * отправляет им напоминание через callback и помечает expiryReminderSentAt.
   */
  async runExpiryReminders(sendReminder: (telegramId: string, expiresAt: Date) => Promise<void>): Promise<void> {
    const now = new Date();
    const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);
    const users = await this.prisma.vpnUser.findMany({
      where: {
        status: 'ACTIVE',
        telegramId: { not: null },
        expiresAt: { not: null, gt: windowStart, lte: windowEnd },
      },
    });
    const cutoff24h = 24 * 60 * 60 * 1000;
    for (const user of users) {
      const expiresAt = user.expiresAt!;
      const alreadySent =
        user.expiryReminderSentAt != null &&
        user.expiryReminderSentAt.getTime() >= expiresAt.getTime() - cutoff24h;
      if (alreadySent) continue;
      const telegramId = user.telegramId!;
      try {
        await sendReminder(telegramId, expiresAt);
        await this.prisma.vpnUser.update({
          where: { id: user.id },
          data: { expiryReminderSentAt: now },
        });
      } catch (e: unknown) {
        this.logger.warn(`runExpiryReminders: failed for user ${user.id} — ${(e as Error)?.message ?? e}`);
      }
    }
  }

  async expireUsersByCron() {
    const now = new Date();
    // Деактивируем подписки с истёкшим сроком (чтобы БД и панель были в консистентном состоянии)
    await this.prisma.subscription.updateMany({
      where: { active: true, endsAt: { lt: now } },
      data: { active: false },
    });

    // 1. Помечаем ACTIVE → EXPIRED
    const newlyExpired = await this.prisma.vpnUser.findMany({
      where: { status: 'ACTIVE', expiresAt: { not: null, lt: now } },
      select: { id: true },
    });
    if (newlyExpired.length) {
      await this.prisma.vpnUser.updateMany({
        where: { id: { in: newlyExpired.map((u) => u.id) } },
        data: { status: 'EXPIRED' },
      });
    }

    // 2. Чистим панель для ВСЕХ expired (включая ретрай для тех, у кого ранее не удалось)
    const expiredWithServers = await this.prisma.vpnUser.findMany({
      where: {
        status: 'EXPIRED',
        OR: [
          { userServers: { some: { active: true } } },
          { server: { isNot: null }, panelEmail: { not: null } },
        ],
      },
      include: { userServers: { where: { active: true }, include: { server: true } }, server: true },
    });

    for (const user of expiredWithServers) {
      const cleaned = await this.cleanupPanelClients(user);
      // Помечаем успешно очищенные userServers как inactive, чтобы не ретраить
      if (cleaned.length) {
        await this.prisma.userServer.updateMany({
          where: { id: { in: cleaned } },
          data: { active: false },
        });
      }
    }
  }

  /** Удаляет клиентов из панели X-UI. Возвращает id успешно очищенных userServers. */
  private async cleanupPanelClients(
    user: { id: string; panelEmail?: string | null; server?: any; userServers?: Array<{ id: string; panelEmail: string; server: any }> },
  ): Promise<string[]> {
    const panelTargets: Array<{ userServerId?: string; server: any; email: string }> = [];
    if (user.userServers?.length) {
      for (const us of user.userServers) {
        if (us.panelEmail && us.server) panelTargets.push({ userServerId: us.id, server: us.server, email: us.panelEmail });
      }
    }
    if (panelTargets.length === 0 && user.server && user.panelEmail) {
      panelTargets.push({ server: user.server, email: user.panelEmail });
    }

    const secret = this.config.getOrThrow<string>('PANEL_CRED_SECRET');
    const cleanedIds: string[] = [];

    for (const { userServerId, server, email } of panelTargets) {
      if (!server?.panelBaseUrl || !server?.panelUsername || !server?.panelPasswordEnc || server?.panelInboundId == null) continue;
      try {
        const panelPassword = SecretBox.decrypt(server.panelPasswordEnc, secret);
        const auth = await this.xui.login(server.panelBaseUrl, server.panelUsername, panelPassword);
        if (auth.cookie || auth.token) {
          try {
            await this.xui.updateClient(server.panelBaseUrl, auth, server.panelInboundId, email, { enable: false });
          } catch (disableErr: any) {
            this.logger.warn(
              `cleanupPanelClients: disable failed for ${email} (user ${user.id}): ${disableErr?.message ?? disableErr}. Will try delete.`,
            );
          }
          try {
            await this.xui.deleteClient(server.panelBaseUrl, auth, server.panelInboundId, email);
          } catch (delErr: any) {
            const msg: string = delErr?.message ?? '';
            // «Client not found» = уже удалён из панели — считаем успехом
            if (!msg.includes('not found')) throw delErr;
          }
          if (userServerId) cleanedIds.push(userServerId);
        }
      } catch (e: any) {
        this.logger.warn(`cleanupPanelClients: failed for user ${user.id} (${email}) — ${e?.message ?? e}`);
      }
    }

    return cleanedIds;
  }
}
