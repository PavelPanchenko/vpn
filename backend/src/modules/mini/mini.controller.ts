import { BadRequestException, Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MiniInitDataDto } from './dto/mini-auth.dto';
import { MiniPayDto } from './dto/mini-pay.dto';
import { MiniActivateServerDto } from './dto/mini-activate.dto';
import { MiniBrowserStatusDto } from './dto/mini-browser-status.dto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { PlansService } from '../plans/plans.service';
import { PaymentsService } from '../payments/payments.service';
import { ServersService } from '../servers/servers.service';
import { BotService } from '../bot/bot.service';
import { buildSubscriptionMetrics, type VpnUserStatus } from '../../common/subscription/subscription-metrics';
import { toDateLike, type DateLike } from '../../common/subscription/user-like';
import * as crypto from 'crypto';
import { PaymentIntentsService } from '../payments/payment-intents/payment-intents.service';

/** Очередь операций "найти или создать" по telegramId — устраняет гонку при двойном вызове (например React Strict Mode). */
const getOrCreateLocks = new Map<string, Promise<unknown>>();

@Controller('mini')
export class MiniController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly plansService: PlansService,
    private readonly paymentsService: PaymentsService,
    private readonly paymentIntents: PaymentIntentsService,
    private readonly serversService: ServersService,
    private readonly botService: BotService,
    private readonly configService: ConfigService,
  ) {}

  private async requireUserByTelegramId(telegramId: string) {
    const user = await this.usersService.findByTelegramId(telegramId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  /**
   * Валидация initData от Telegram WebApp.
   * Основано на официальной документации:
   * https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
   */
  private async validateInitData(initData: string): Promise<{ telegramId: string; name: string; languageCode: string | null }> {
    if (!initData) {
      throw new UnauthorizedException('Missing initData');
    }

    // Standalone browser mode token: browser:<telegramId>:<expiresAtMs>:<sig>
    if (initData.startsWith('browser:')) {
      const verified = this.verifyBrowserInitData(initData);
      if (!verified) {
        throw new UnauthorizedException('Invalid browser initData');
      }
      if (verified.expiresAtMs <= Date.now()) {
        throw new UnauthorizedException('Browser initData expired');
      }
      const telegramId = verified.telegramId;
      const user = await this.usersService.findByTelegramId(telegramId);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }
      return { telegramId, name: user.name || 'User', languageCode: user.telegramLanguageCode ?? null };
    }

    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) {
      throw new UnauthorizedException('Missing hash');
    }

    params.delete('hash');

    // Строим data_check_string
    const dataCheckArray: string[] = [];
    params.sort();
    params.forEach((value, key) => {
      dataCheckArray.push(`${key}=${value}`);
    });
    const dataCheckString = dataCheckArray.join('\n');

    // Секретный ключ для Telegram WebApp:
    // secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)
    // https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
    const token = await this.botService.getToken();
    if (!token) {
      throw new UnauthorizedException('Bot token not configured');
    }

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    // Безопасное сравнение
    const a = Buffer.from(hmac, 'hex');
    const b = Buffer.from(hash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedException(
        'Invalid initData hash. Откройте мини‑приложение только через кнопку в том же боте, ' +
          'который настроен в админке (активный бот). Проверьте, что токен в админке совпадает с ботом, из которого открываете приложение.',
      );
    }

    const userParam = params.get('user');
    if (!userParam) {
      throw new UnauthorizedException('Missing user in initData');
    }

    let userObj: any;
    try {
      userObj = JSON.parse(userParam);
    } catch {
      throw new UnauthorizedException('Invalid user payload');
    }

    if (!userObj.id) {
      throw new UnauthorizedException('Invalid user id');
    }

    const telegramId = String(userObj.id);
    const name: string =
      [userObj.first_name, userObj.last_name].filter(Boolean).join(' ') ||
      userObj.username ||
      'User';

    const languageCode = userObj.language_code ? String(userObj.language_code) : null;

    return { telegramId, name, languageCode };
  }

  private signBrowserInitData(args: { telegramId: string; expiresAtMs: number }): string {
    const secret = this.configService.get<string>('JWT_SECRET') || '';
    if (!secret) throw new Error('JWT_SECRET is not configured');
    const base = `browser:${args.telegramId}:${args.expiresAtMs}`;
    const sig = crypto.createHmac('sha256', secret).update(base).digest('hex');
    return `${base}:${sig}`;
  }

  private verifyBrowserInitData(token: string): { telegramId: string; expiresAtMs: number } | null {
    const secret = this.configService.get<string>('JWT_SECRET') || '';
    if (!secret) return null;
    const parts = token.split(':');
    if (parts.length !== 4) return null;
    const [kind, telegramId, expiresAtRaw, sig] = parts;
    if (kind !== 'browser') return null;
    const expiresAtMs = Number(expiresAtRaw);
    if (!telegramId || !Number.isFinite(expiresAtMs)) return null;
    const base = `browser:${telegramId}:${expiresAtMs}`;
    const expected = crypto.createHmac('sha256', secret).update(base).digest('hex');
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(sig, 'hex');
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
    return { telegramId, expiresAtMs };
  }

  private async createBrowserLoginSession() {
    const ttlMinutes = Number(this.configService.get<string>('MINI_BROWSER_LOGIN_TTL_MINUTES', '5'));
    const expiresAt = new Date(Date.now() + Math.max(1, ttlMinutes) * 60_000);

    // simple retry on collisions
    for (let i = 0; i < 20; i++) {
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
      try {
        const created = await (this.prisma as any).browserLoginSession.create({
          data: { code, status: 'PENDING', expiresAt },
        });
        return { loginId: created.id as string, code, expiresAt: created.expiresAt as Date };
      } catch {
        // collision, retry
      }
    }
    throw new Error('Failed to allocate login code');
  }

  @Post('browser/start')
  async browserStart() {
    const s = await this.createBrowserLoginSession();
    const bot = await this.botService.getBotMe();
    const botUsername = bot.username ?? null;
    const deepLink = botUsername ? `https://t.me/${botUsername}?start=web_${s.code}` : null;
    return { loginId: s.loginId, expiresAt: s.expiresAt.toISOString(), deepLink };
  }

  @Post('browser/status')
  async browserStatus(@Body() dto: MiniBrowserStatusDto) {
    const session = await (this.prisma as any).browserLoginSession.findUnique({ where: { id: dto.loginId } });
    if (!session) {
      throw new BadRequestException('Login session not found');
    }

    if (session.status === 'PENDING' && new Date(session.expiresAt).getTime() <= Date.now()) {
      await (this.prisma as any).browserLoginSession.update({
        where: { id: session.id },
        data: { status: 'EXPIRED' },
      });
      return { status: 'EXPIRED' as const };
    }

    if (session.status === 'APPROVED' && session.telegramId) {
      const tokenTtlHours = Number(this.configService.get<string>('MINI_BROWSER_TOKEN_TTL_HOURS', '12'));
      const expiresAtMs = Date.now() + Math.max(1, tokenTtlHours) * 60 * 60_000;
      const initData = this.signBrowserInitData({ telegramId: String(session.telegramId), expiresAtMs });
      return { status: 'APPROVED' as const, initData };
    }

    return { status: String(session.status) as 'PENDING' | 'EXPIRED' | 'APPROVED' };
  }

  private async getOrCreateUser(telegramId: string, name: string) {
    const run = async (): Promise<NonNullable<Awaited<ReturnType<typeof this.doGetOrCreateUser>>>> => {
      return this.doGetOrCreateUser(telegramId, name);
    };
    const prev = getOrCreateLocks.get(telegramId);
    const next = prev ? prev.then(() => run(), () => run()) : run();
    getOrCreateLocks.set(telegramId, next);
    try {
      return await next;
    } finally {
      if (getOrCreateLocks.get(telegramId) === next) {
        getOrCreateLocks.delete(telegramId);
      }
    }
  }

  private async doGetOrCreateUser(telegramId: string, name: string) {
    const user = await this.usersService.getOrCreateByTelegramId(telegramId, name, {
      userServers: { include: { server: true } },
      subscriptions: {
        where: { active: true },
        orderBy: { endsAt: 'desc' },
        // Берём несколько на случай исторической рассинхронизации (помогает корректно выбрать подписку для прогресса)
        take: 5,
      },
    });

    return user!;
  }

  private buildStatusPayload(
    user: {
      id: string;
      status: VpnUserStatus | null | undefined;
      expiresAt: DateLike;
      userServers?: Array<{ isActive: boolean; server: { id: string; name: string } }>;
      subscriptions?: Array<{ id: string; periodDays: number; startsAt: DateLike; endsAt: DateLike }>;
    },
    trafficUsed: number | null = null,
  ) {
    const activeServers = (user.userServers || []).filter((us) => us.isActive);

    const subs = Array.isArray(user.subscriptions) ? user.subscriptions : [];
    const expiresAt = toDateLike(user.expiresAt);
    const subscriptionForUi =
      expiresAt && subs.length > 0
        ? (subs.find((s) => {
            const endsAt = toDateLike(s?.endsAt);
            return endsAt ? endsAt.getTime() === expiresAt.getTime() : false;
          }) ??
          subs[0] ??
          null)
        : (subs[0] ?? null);

    const metrics = buildSubscriptionMetrics({
      currentStatus: user.status,
      expiresAt: user.expiresAt,
      startsAt: subscriptionForUi?.startsAt,
      endsAt: subscriptionForUi?.endsAt,
      periodDays: subscriptionForUi?.periodDays ?? null,
    });

    return {
      id: user.id,
      status: metrics.status,
      expiresAt: metrics.expiresAtIso,
      daysLeft: metrics.daysLeft,
      progressLeftPct: metrics.progressLeftPct,
      trafficUsed,
      servers: activeServers.map((us: any) => ({
        id: us.server.id,
        name: us.server.name,
      })),
      subscription: subscriptionForUi
        ? {
            id: subscriptionForUi.id,
            periodDays: subscriptionForUi.periodDays,
            startsAt: subscriptionForUi.startsAt instanceof Date ? subscriptionForUi.startsAt.toISOString() : subscriptionForUi.startsAt,
            endsAt: subscriptionForUi.endsAt instanceof Date ? subscriptionForUi.endsAt.toISOString() : subscriptionForUi.endsAt,
          }
        : null,
    };
  }

  @Post('auth')
  async auth(@Body() dto: MiniInitDataDto) {
    const { telegramId, name, languageCode } = await this.validateInitData(dto.initData);
    void this.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, languageCode);

    const user = await this.getOrCreateUser(telegramId, name);

    return {
      id: user!.id,
      telegramId: user!.telegramId,
      name: user!.name,
      status: user!.status,
      expiresAt: user!.expiresAt,
    };
  }

  @Post('status')
  async status(@Body() dto: MiniInitDataDto) {
    const { telegramId, name, languageCode } = await this.validateInitData(dto.initData);
    void this.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, languageCode);
    const user = await this.getOrCreateUser(telegramId, name);
    // DRY: синхронизируем expiresAt по активной подписке перед расчётом daysLeft/прогресса
    const synced = await this.usersService.syncExpiresAtWithActiveSubscription(user.id);
    if (synced?.endsAt) {
      user.expiresAt = synced.endsAt;
    }
    const trafficUsed: number | null = null;
    const bot = await this.botService.getBotMe();
    return {
      ...this.buildStatusPayload(user, trafficUsed),
      botName: bot.name,
      botUsername: bot.username ?? null,
    };
  }

  @Post('servers')
  async servers(@Body() dto: MiniInitDataDto) {
    const { telegramId, name, languageCode } = await this.validateInitData(dto.initData);
    void this.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, languageCode);
    await this.getOrCreateUser(telegramId, name);

    const all = await this.serversService.list();
    const active = all.filter((s: any) => s.active);
    const sorted = [...active].sort((a: any, b: any) => {
      if (a.isRecommended && !b.isRecommended) return -1;
      if (!a.isRecommended && b.isRecommended) return 1;
      const freeA = a.freeSlots ?? -1;
      const freeB = b.freeSlots ?? -1;
      return freeB - freeA;
    });

    return sorted.map((s: any) => ({
      id: s.id,
      name: s.name,
      freeSlots: s.freeSlots,
      isRecommended: s.isRecommended ?? false,
    }));
  }

  @Post('activate')
  async activate(@Body() dto: MiniActivateServerDto) {
    const { telegramId, name, languageCode } = await this.validateInitData(dto.initData);
    void this.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, languageCode);
    const user = await this.getOrCreateUser(telegramId, name);

    // 1) если сервер уже добавлен — просто активируем (без изменения подписки)
    const existing = await this.prisma.userServer.findUnique({
      where: { vpnUserId_serverId: { vpnUserId: user.id, serverId: dto.serverId } },
    });

    if (existing) {
      const updated = await this.usersService.activateServer(user.id, dto.serverId);
      return this.buildStatusPayload(updated as any);
    }

    // 2) если серверов ещё не было — выдаём триал
    const anyServers = await this.prisma.userServer.count({ where: { vpnUserId: user.id } });
    if (anyServers === 0) {
      const result = await this.usersService.addServerAndTrial(user.id, dto.serverId, 3);
      return this.buildStatusPayload(result.updated as any);
    }

    // 3) иначе — добавляем новую локацию, используя текущий expiresAt (без сброса подписки)
    const updated = await this.usersService.addServer(user.id, dto.serverId);
    return this.buildStatusPayload(updated as any);
  }

  @Post('config')
  async config(@Body() dto: MiniInitDataDto) {
    const { telegramId, languageCode } = await this.validateInitData(dto.initData);
    void this.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, languageCode);
    const user = await this.requireUserByTelegramId(telegramId);

    const configResult = await this.usersService.getConfig(user.id);

    if (!configResult || !configResult.configs || configResult.configs.length === 0) {
      throw new BadRequestException('No active configuration available');
    }

    return configResult;
  }

  @Post('plans')
  async plans(@Body() dto: MiniInitDataDto) {
    const { telegramId, name, languageCode } = await this.validateInitData(dto.initData);
    void this.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, languageCode);
    const user = await this.getOrCreateUser(telegramId, name);
    const plans = await this.plansService.list(user.id);

    // Для mini-app отдаём плоский список вариантов (как раньше), чтобы UI остался простым:
    // id == variantId, а name/periodDays/description берём из плана.
    const out: Array<{
      id: string;
      name: string;
      price: number;
      currency: string;
      periodDays: number;
      description?: string | null;
      isTop?: boolean;
    }> = [];

    for (const p of plans as any[]) {
      const vars = p.variants ?? [];
      for (const v of vars) {
        out.push({
          id: v.id,
          name: p.name,
          price: v.price,
          currency: v.currency,
          periodDays: p.periodDays,
          description: p.description ?? null,
          isTop: p.isTop ?? false,
        });
      }
    }

    return out;
  }

  @Post('pay')
  async pay(@Body() dto: MiniPayDto) {
    const { telegramId, languageCode } = await this.validateInitData(dto.initData);
    void this.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, languageCode);
    const user = await this.requireUserByTelegramId(telegramId);

    const botToken = dto.provider === 'TELEGRAM_STARS' ? await this.botService.getToken() : null;
    const res = await this.paymentIntents.createForVariant({
      vpnUserId: user.id,
      variantId: dto.variantId,
      provider: dto.provider,
      botToken: botToken ?? undefined,
    });

    if ('type' in res && res.type === 'UNSUPPORTED') {
      throw new BadRequestException(res.reason);
    }
    if ('invoiceLink' in res) {
      return { provider: 'TELEGRAM_STARS', invoiceLink: res.invoiceLink };
    }
    if ('paymentUrl' in res) {
      return { provider: (dto.provider ?? 'PLATEGA') as any, paymentUrl: res.paymentUrl };
    }
    throw new BadRequestException('Payment provider is not available');
  }
}

