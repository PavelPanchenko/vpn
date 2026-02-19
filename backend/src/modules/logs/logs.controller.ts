import { Controller, Delete, Get } from '@nestjs/common';
import { AdminAuth } from '../../common/guards/admin-auth.decorator';
import { LogsService } from './logs.service';

@Controller('logs')
@AdminAuth()
export class LogsController {
  constructor(private readonly logs: LogsService) {}

  @Get()
  getLogs(): { lines: string[] } {
    return { lines: this.logs.getLines() };
  }

  @Delete()
  clearLogs(): { ok: boolean } {
    this.logs.clear();
    return { ok: true };
  }
}
