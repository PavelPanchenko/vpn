import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BotModule } from '../bot/bot.module';
import { UsersModule } from '../users/users.module';
import { BroadcastService } from './broadcast.service';
import { BroadcastController } from './broadcast.controller';

@Module({
  imports: [PrismaModule, BotModule, UsersModule],
  providers: [BroadcastService],
  controllers: [BroadcastController],
})
export class BroadcastModule {}
