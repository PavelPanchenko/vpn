import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UsersService } from '../users/users.service';
import { PaymentIntentsService } from '../payments/payment-intents/payment-intents.service';

@Injectable()
export class SchedulerService {
  constructor(
    private readonly usersService: UsersService,
    private readonly paymentIntents: PaymentIntentsService,
  ) {}

  /**
   * Ежедневный крон в 00:00:
   * - помечает истёкшие подписки
   * - проставляет статус EXPIRED пользователям
   * - по возможности выключает клиентов в x-ui панели
   */
  @Cron('0 0 * * *')
  async handleDailyExpirationJob() {
    await this.usersService.expireUsersByCron();
  }

  /**
   * Каждую минуту: помечаем истёкшие payment intents (PENDING -> EXPIRED).
   */
  @Cron('*/1 * * * *')
  async handlePaymentIntentsExpireJob() {
    await this.paymentIntents.markExpiredIntents();
  }
}

