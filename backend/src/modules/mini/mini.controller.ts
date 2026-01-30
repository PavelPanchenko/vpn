import { BadRequestException, Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { MiniInitDataDto } from './dto/mini-auth.dto';
import { MiniPayDto } from './dto/mini-pay.dto';
import { MiniActivateServerDto } from './dto/mini-activate.dto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { PlansService } from '../plans/plans.service';
import { PaymentsService } from '../payments/payments.service';
import { ServersService } from '../servers/servers.service';
import { BotService } from '../bot/bot.service';
import { buildSubscriptionMetrics } from '../../common/subscription/subscription-metrics';
import * as crypto from 'crypto';

/** Очередь операций "найти или создать" по telegramId — устраняет гонку при двойном вызове (например React Strict Mode). */
const getOrCreateLocks = new Map<string, Promise<unknown>>();

@Controller('mini')
export class MiniController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly plansService: PlansService,
    private readonly paymentsService: PaymentsService,
    private readonly serversService: ServersService,
    private readonly botService: BotService,
  ) {}

  /**
   * Валидация initData от Telegram WebApp.
   * Основано на официальной документации:
   * https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
   */
  private async validateInitData(initData: string): Promise<{ telegramId: string; name: string }> {
    if (!initData) {
      throw new UnauthorizedException('Missing initData');
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
      userObj.first_name ||
      userObj.username ||
      (userObj.last_name ? `${userObj.first_name} ${userObj.last_name}` : 'User');

    return { telegramId, name };
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
    let user = await this.prisma.vpnUser.findFirst({
      where: { telegramId },
      include: {
        userServers: { include: { server: true } },
        subscriptions: {
          where: { active: true },
          orderBy: { endsAt: 'desc' },
          // Берём несколько на случай исторической рассинхронизации (помогает корректно выбрать подписку для прогресса)
          take: 5,
        },
      },
    });

    if (!user) {
      const created = await this.usersService.createFromTelegram(telegramId, name);
      user = await this.prisma.vpnUser.findUnique({
        where: { id: created.id },
        include: {
          userServers: { include: { server: true } },
          subscriptions: {
            where: { active: true },
            orderBy: { endsAt: 'desc' },
            take: 5,
          },
        },
      });
    }

    return user!;
  }

  private buildStatusPayload(user: any, trafficUsed: number | null = null) {
    const activeServers = (user.userServers || []).filter((us: any) => us.isActive);

    const subs: any[] = Array.isArray(user.subscriptions) ? user.subscriptions : [];
    const subscriptionForUi =
      user.expiresAt && subs.length > 0
        ? (subs.find((s: any) => s?.endsAt && new Date(s.endsAt).getTime() === new Date(user.expiresAt).getTime()) ??
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
    const { telegramId, name } = await this.validateInitData(dto.initData);

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
    const { telegramId, name } = await this.validateInitData(dto.initData);
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
    const { telegramId, name } = await this.validateInitData(dto.initData);
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
    const { telegramId, name } = await this.validateInitData(dto.initData);
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
    const { telegramId } = await this.validateInitData(dto.initData);

    const user = await this.prisma.vpnUser.findFirst({
      where: { telegramId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const configResult = await this.usersService.getConfig(user.id);

    if (!configResult || !configResult.configs || configResult.configs.length === 0) {
      throw new BadRequestException('No active configuration available');
    }

    return configResult;
  }

  @Post('plans')
  async plans(@Body() dto: MiniInitDataDto) {
    const { telegramId, name } = await this.validateInitData(dto.initData);
    const user = await this.getOrCreateUser(telegramId, name);
    return this.plansService.list(user.id);
  }

  @Post('pay')
  async pay(@Body() dto: MiniPayDto) {
    const { telegramId } = await this.validateInitData(dto.initData);

    const user = await this.prisma.vpnUser.findFirst({
      where: { telegramId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const plan = await this.prisma.plan.findUnique({
      where: { id: dto.planId },
    });

    if (!plan || !plan.active || plan.isTrial) {
      throw new BadRequestException('Plan is not available');
    }

    const payment = await this.paymentsService.create({
      vpnUserId: user.id,
      planId: plan.id,
      amount: plan.price,
      currency: plan.currency,
      status: 'PAID',
    });

    if (!payment) {
      // Теоретически create не должен возвращать null, но этот guard оставлен
      // из-за строгой типизации и на случай изменений в реализации сервиса.
      throw new BadRequestException('Failed to create payment');
    }

    return {
      paymentId: payment.id,
      status: payment.status,
    };
  }
}

