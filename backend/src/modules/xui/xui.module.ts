import { Module } from '@nestjs/common';
import { XuiService } from './xui.service';
import { XrayStatsService } from './xray-stats.service';

@Module({
  providers: [XuiService, XrayStatsService],
  exports: [XuiService, XrayStatsService],
})
export class XuiModule {}

