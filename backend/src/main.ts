import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { BufferLogger } from './common/buffer-logger';

function parseCorsOrigins(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function isNgrokOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    return host.endsWith('.ngrok-free.app') || host.endsWith('.ngrok.app');
  } catch {
    return false;
  }
}

function isLocalhostOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule, { logger: new BufferLogger() });
    const config = app.get(ConfigService);
    const corsOrigin = config.get<string>('CORS_ORIGIN');
    const allowlist = parseCorsOrigins(corsOrigin);
    const allowNgrok = config.get<string>('CORS_ALLOW_NGROK', 'true') !== 'false';
    const allowLocalhost = config.get<string>('CORS_ALLOW_LOCALHOST', 'true') !== 'false';

    app.enableCors({
      origin: (origin, cb) => {
        // non-browser clients / same-origin
        if (!origin) return cb(null, true);

        if (allowlist.includes(origin)) return cb(null, true);
        if (allowNgrok && isNgrokOrigin(origin)) return cb(null, true);
        if (allowLocalhost && isLocalhostOrigin(origin)) return cb(null, true);

        return cb(new Error(`CORS: origin not allowed: ${origin}`), false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'ngrok-skip-browser-warning'],
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    const port = Number(config.get('PORT', 3000));
    await app.listen(port);
    console.log(`🚀 Application is running on: http://localhost:${port}`);
  } catch (error) {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
  }
}

void bootstrap();

