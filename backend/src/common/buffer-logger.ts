import { ConsoleLogger } from '@nestjs/common';
import { LogBuffer } from './log-buffer';

const CONSOLE_LEVELS = (process.env.LOG_LEVEL_CONSOLE ?? 'warn,error')
  .toLowerCase()
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const BUFFER_LEVELS = (process.env.LOG_LEVEL_BUFFER ?? 'log,warn,error')
  .toLowerCase()
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function consoleEnabled(level: string): boolean {
  return CONSOLE_LEVELS.includes(level);
}

function bufferEnabled(level: string): boolean {
  return BUFFER_LEVELS.includes(level);
}

/**
 * Логгер: консоль — LOG_LEVEL_CONSOLE (по умолчанию warn,error),
 * буфер для админки — LOG_LEVEL_BUFFER (по умолчанию log,warn,error, без debug/verbose).
 */
export class BufferLogger extends ConsoleLogger {
  override log(message: string, context?: string): void {
    if (consoleEnabled('log')) super.log(message, context);
    if (bufferEnabled('log')) LogBuffer.append('LOG', message, context);
  }

  override error(message: string, trace?: string, context?: string): void {
    if (consoleEnabled('error')) super.error(message, trace, context);
    if (bufferEnabled('error')) LogBuffer.append('ERROR', trace ? `${message} ${trace}` : message, context);
  }

  override warn(message: string, context?: string): void {
    if (consoleEnabled('warn')) super.warn(message, context);
    if (bufferEnabled('warn')) LogBuffer.append('WARN', message, context);
  }

  override debug(message: string, context?: string): void {
    if (consoleEnabled('debug')) super.debug(message, context);
    if (bufferEnabled('debug')) LogBuffer.append('DEBUG', message, context);
  }

  override verbose(message: string, context?: string): void {
    if (consoleEnabled('verbose')) super.verbose(message, context);
    if (bufferEnabled('verbose')) LogBuffer.append('VERBOSE', message, context);
  }
}
