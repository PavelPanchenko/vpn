import { Module, forwardRef } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UserAvatarController } from './user-avatar.controller';
import { UsersService } from './users.service';
import { XuiModule } from '../xui/xui.module';
import { BotModule } from '../bot/bot.module';

@Module({
  imports: [XuiModule, forwardRef(() => BotModule)],
  controllers: [UsersController, UserAvatarController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

