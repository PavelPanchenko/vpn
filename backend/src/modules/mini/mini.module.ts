import { Module, forwardRef } from '@nestjs/common';
import { MiniController } from './mini.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { PlansModule } from '../plans/plans.module';
import { PaymentsModule } from '../payments/payments.module';
import { ServersModule } from '../servers/servers.module';
import { BotModule } from '../bot/bot.module';

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    PlansModule,
    PaymentsModule,
    ServersModule,
    forwardRef(() => BotModule),
  ],
  controllers: [MiniController],
})
export class MiniModule {}

