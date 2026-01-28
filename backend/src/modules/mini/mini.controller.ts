import { BadRequestException, Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { MiniInitDataDto } from './dto/mini-auth.dto';
import { MiniPayDto } from './dto/mini-pay.dto';
import { MiniActivateServerDto } from './dto/mini-activate.dto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { PlansService } from '../plans/plans.service';
import { PaymentsService } from '../payments/payments.service';
import { BotService } from '../bot/bot.service';
import * as crypto from 'crypto';

@Controller('mini')
export class MiniController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly plansService: PlansService,
    private readonly paymentsService: PaymentsService,
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
      throw new UnauthorizedException('Invalid initData hash');
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
    let user = await this.prisma.vpnUser.findFirst({
      where: { telegramId },
      include: {
        userServers: { include: { server: true } },
        subscriptions: {
          where: { active: true },
          orderBy: { endsAt: 'desc' },
          take: 1,
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
            take: 1,
          },
        },
      });
    }

    return user!;
  }

  private buildStatusPayload(user: any) {
    let daysLeft: number | null = null;
    if (user.expiresAt) {
      const now = new Date();
      daysLeft = Math.ceil((user.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }

    const activeServers = (user.userServers || []).filter((us: any) => us.isActive);

    return {
      id: user.id,
      status: user.status,
      expiresAt: user.expiresAt,
      daysLeft,
      servers: activeServers.map((us: any) => ({
        id: us.server.id,
        name: us.server.name,
      })),
      subscription: user.subscriptions?.[0]
        ? {
            id: user.subscriptions[0].id,
            periodDays: user.subscriptions[0].periodDays,
            startsAt: user.subscriptions[0].startsAt,
            endsAt: user.subscriptions[0].endsAt,
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
    return this.buildStatusPayload(user);
  }

  @Post('servers')
  async servers(@Body() dto: MiniInitDataDto) {
    const { telegramId, name } = await this.validateInitData(dto.initData);
    await this.getOrCreateUser(telegramId, name);

    const servers = await this.prisma.vpnServer.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true },
    });

    return servers;
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
      const updated = await this.usersService.addServerAndTrial(user.id, dto.serverId, 3);
      return this.buildStatusPayload(updated as any);
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
    const { telegramId } = await this.validateInitData(dto.initData);

    const user = await this.prisma.vpnUser.findFirst({
      where: { telegramId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const plans = await this.plansService.list(user.id);
    // Фронт может сам решать, какие показывать, но по умолчанию вернем только активные
    return plans.filter((p: any) => p.active);
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

