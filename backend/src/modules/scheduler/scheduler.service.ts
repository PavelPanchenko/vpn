import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UsersService } from '../users/users.service';

@Injectable()
export class SchedulerService {
  constructor(private readonly usersService: UsersService) {}

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
}

