import { Module } from '@nestjs/common';
import { BotModule } from '../bot/bot.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PublicController } from './public.controller';

@Module({
  imports: [BotModule, PrismaModule],
  controllers: [PublicController],
})
export class PublicModule {}

