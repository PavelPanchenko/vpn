import { Module, forwardRef } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TelegramBotService } from './telegram-bot.service';
import { UsersModule } from '../users/users.module';
import { PlansModule } from '../plans/plans.module';
import { PaymentsModule } from '../payments/payments.module';
import { SupportModule } from '../support/support.module';

@Module({
  imports: [PrismaModule, forwardRef(() => UsersModule), PlansModule, forwardRef(() => PaymentsModule), SupportModule],
  providers: [
    BotService,
    TelegramBotService,
    { provide: 'TELEGRAM_NOTIFIER', useExisting: TelegramBotService },
  ],
  controllers: [BotController],
  exports: [BotService, TelegramBotService, 'TELEGRAM_NOTIFIER'],
})
export class BotModule {}
