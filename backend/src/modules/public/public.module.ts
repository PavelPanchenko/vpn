import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BotModule } from '../bot/bot.module';
import { PublicController } from './public.controller';

@Module({
  imports: [ConfigModule, BotModule],
  controllers: [PublicController],
})
export class PublicModule {}

