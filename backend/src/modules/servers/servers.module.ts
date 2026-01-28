import { Module } from '@nestjs/common';
import { ServersService } from './servers.service';
import { ServersController } from './servers.controller';
import { XuiModule } from '../xui/xui.module';

@Module({
  imports: [XuiModule],
  providers: [ServersService],
  controllers: [ServersController],
})
export class ServersModule {}

