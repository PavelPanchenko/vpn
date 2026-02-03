import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UsersService } from '../users/users.service';
import { PaymentIntentsService } from '../payments/payment-intents/payment-intents.service';
import { TelegramBotService } from '../bot/telegram-bot.service';

@Injectable()
export class SchedulerService {
  constructor(
    private readonly usersService: UsersService,
    private readonly paymentIntents: PaymentIntentsService,
    private readonly telegramBot: TelegramBotService,
  ) {}

  /**
   * Каждые 15 минут: помечаем истёкших по времени expiresAt и отключаем/удаляем клиентов в x-ui.
   * Нагрузка минимальна (2 запроса к БД + вызовы панели только при наличии истёкших).
   * Для отключения в течение минуты после истечения — заменить на '* * * * *'.
   */
  @Cron('*/15 * * * *')
  async handleExpirationJob() {
    await this.usersService.expireUsersByCron();
  }

  /**
   * Каждый час: напоминание об истечении подписки за сутки (окно 23–25 ч до expiresAt).
   */
  @Cron('0 * * * *')
  async handleExpiryReminderJob() {
    await this.usersService.runExpiryReminders((telegramId, expiresAt) =>
      this.telegramBot.sendExpiryReminder(telegramId, expiresAt),
    );
  }

  /**
   * Каждую минуту: помечаем истёкшие payment intents (PENDING -> EXPIRED).
   */
  @Cron('*/1 * * * *')
  async handlePaymentIntentsExpireJob() {
    await this.paymentIntents.markExpiredIntents();
  }
}

