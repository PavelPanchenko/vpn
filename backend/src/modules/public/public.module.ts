import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BotModule } from '../bot/bot.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PublicController } from './public.controller';

@Module({
  imports: [ConfigModule, BotModule, PrismaModule],
  controllers: [PublicController],
})
export class PublicModule {}

