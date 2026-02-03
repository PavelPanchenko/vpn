import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { UsersModule } from '../users/users.module';
import { PaymentsModule } from '../payments/payments.module';
import { BotModule } from '../bot/bot.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    UsersModule,
    PaymentsModule,
    forwardRef(() => BotModule),
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}

