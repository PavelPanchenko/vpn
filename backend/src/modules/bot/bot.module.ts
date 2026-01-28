import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TelegramBotService } from './telegram-bot.service';
import { UsersModule } from '../users/users.module';
import { PlansModule } from '../plans/plans.module';
import { PaymentsModule } from '../payments/payments.module';
import { SupportModule } from '../support/support.module';

@Module({
  imports: [PrismaModule, UsersModule, PlansModule, PaymentsModule, SupportModule],
  providers: [BotService, TelegramBotService],
  controllers: [BotController],
  exports: [BotService, TelegramBotService],
})
export class BotModule {}
