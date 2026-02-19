import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramBotService } from '../bot/telegram-bot.service';
import { UsersService } from '../users/users.service';
import type { Prisma } from '@prisma/client';

export enum BroadcastAudience {
  ALL = 'ALL',
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  NEW = 'NEW',
  BLOCKED = 'BLOCKED',
  EXPIRING_SOON = 'EXPIRING_SOON',
}

export interface BroadcastResult {
  total: number;
  sent: number;
  failed: number;
  blocked: number;
}

/** Задержка между сообщениями (~30 msg/sec Telegram limit). */
const SEND_DELAY_MS = 35;

@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramBot: TelegramBotService,
    private readonly usersService: UsersService,
  ) {}

  /** Формирует Prisma-where по сегменту аудитории. */
  private buildWhere(audience: BroadcastAudience): Prisma.VpnUserWhereInput {
    const base: Prisma.VpnUserWhereInput = { telegramId: { not: null } };

    switch (audience) {
      case BroadcastAudience.ALL:
        return base;
      case BroadcastAudience.ACTIVE:
        return { ...base, status: 'ACTIVE' };
      case BroadcastAudience.EXPIRED:
        return { ...base, status: 'EXPIRED' };
      case BroadcastAudience.NEW:
        return { ...base, status: 'NEW' };
      case BroadcastAudience.BLOCKED:
        return { ...base, status: 'BLOCKED' };
      case BroadcastAudience.EXPIRING_SOON: {
        const now = new Date();
        const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        return {
          ...base,
          status: 'ACTIVE',
          expiresAt: { not: null, gt: now, lte: threeDays },
        };
      }
      default:
        return base;
    }
  }

  /** Количество получателей для указанного сегмента. */
  async countByAudience(audience: BroadcastAudience): Promise<number> {
    return this.prisma.vpnUser.count({ where: this.buildWhere(audience) });
  }

  /** Отправка рассылки с rate-limiting. */
  async sendBroadcast(audience: BroadcastAudience, message: string): Promise<BroadcastResult> {
    const users = await this.prisma.vpnUser.findMany({
      where: this.buildWhere(audience),
      select: { id: true, telegramId: true },
    });

    const tg = this.telegramBot.getTelegramApi();
    if (!tg) {
      this.logger.warn('Broadcast aborted: bot not initialized');
      return { total: users.length, sent: 0, failed: users.length, blocked: 0 };
    }

    const result: BroadcastResult = { total: users.length, sent: 0, failed: 0, blocked: 0 };

    for (const user of users) {
      const telegramId = user.telegramId!;
      try {
        await tg.sendMessage(telegramId, message, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        });
        result.sent++;
      } catch (err: any) {
        const msg: string = err?.message ?? '';
        if (msg.includes('chat not found') || msg.includes('bot was blocked')) {
          result.blocked++;
          await this.usersService.markBotBlockedByTelegramId(telegramId);
          this.logger.warn(`Broadcast skipped ${telegramId}: ${msg}`);
        } else {
          result.failed++;
          this.logger.warn(`Broadcast failed ${telegramId}: ${msg}`);
        }
      }

      // Rate-limit: ~30 msg/sec
      if (result.sent + result.failed + result.blocked < result.total) {
        await this.delay(SEND_DELAY_MS);
      }
    }

    this.logger.log(
      `Broadcast done: audience=${audience}, total=${result.total}, sent=${result.sent}, failed=${result.failed}, blocked=${result.blocked}`,
    );
    return result;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
