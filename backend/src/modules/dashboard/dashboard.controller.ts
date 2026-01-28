import { Controller, Get } from '@nestjs/common';
import { AdminAuth } from '../../common/guards/admin-auth.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@AdminAuth()
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('stats')
  getStats() {
    return this.dashboard.getStats();
  }
}
