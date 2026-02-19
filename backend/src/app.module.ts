import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { ServersModule } from './modules/servers/servers.module';
import { UsersModule } from './modules/users/users.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { LifecycleModule } from './modules/lifecycle/lifecycle.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { PlansModule } from './modules/plans/plans.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { BotModule } from './modules/bot/bot.module';
import { SupportModule } from './modules/support/support.module';
import { MiniModule } from './modules/mini/mini.module';
import { PublicModule } from './modules/public/public.module';
import { BroadcastModule } from './modules/broadcast/broadcast.module';
import { LogsModule } from './modules/logs/logs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    LifecycleModule,
    ServersModule,
    UsersModule,
    SubscriptionsModule,
    PaymentsModule,
    PlansModule,
    SchedulerModule,
    DashboardModule,
    BotModule,
    SupportModule,
    MiniModule,
    PublicModule,
    BroadcastModule,
    LogsModule,
  ],
})
export class AppModule {}
