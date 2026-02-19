import { Injectable } from '@nestjs/common';
import { LogBuffer } from '../../common/log-buffer';

@Injectable()
export class LogsService {
  getLines(): string[] {
    return LogBuffer.getLines();
  }

  clear(): void {
    LogBuffer.clear();
  }
}
