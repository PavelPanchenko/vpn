import { Injectable, Logger } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import * as path from 'path';
import * as protoLoader from '@grpc/proto-loader';

const PROTO_PATH = path.join(process.cwd(), 'proto', 'xray-stats.proto');

export interface XrayTrafficResult {
  up: number;
  down: number;
  total: number;
}

/** Результат getUserTraffic: трафик в байтах (QueryStats). */
export interface UserTrafficResult {
  uplink: number;
  downlink: number;
  total: number;
}

/** int64 в gRPC может прийти как string, number или Long-объект. */
function parseStatValue(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') return Number(v) || 0;
  const o = v as { low?: number; high?: number; toNumber?: () => number };
  if (typeof o?.toNumber === 'function') return o.toNumber();
  if (typeof o?.low === 'number' && (o.high == null || o.high === 0)) return o.low;
  return Number(v) || 0;
}

const ZERO_TRAFFIC_DIAGNOSTIC_THROTTLE_MS = 10 * 60 * 1000; // 10 min per email

@Injectable()
export class XrayStatsService {
  private readonly logger = new Logger(XrayStatsService.name);
  private lastZeroTrafficDiagnostic = new Map<string, number>();

  /**
   * Получить трафик пользователя через Xray StatsService (gRPC).
   * В config.json Xray должен быть включён api с сервисом StatsService и dokodemo-door inbound.
   */
  async getClientTraffic(
    host: string,
    port: number,
    email: string,
  ): Promise<XrayTrafficResult> {
    const packageDef = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(packageDef) as any;
    const StatsService = proto.xray?.app?.stats?.command?.StatsService;
    if (!StatsService) {
      this.logger.warn('Xray stats proto package not found');
      throw new Error('Xray stats proto not loaded');
    }

    const address = `${host}:${port}`;
    const client = new StatsService(address, grpc.credentials.createInsecure(), {
      'grpc.max_receive_message_length': 4 * 1024 * 1024,
    });

    const getValue = (name: string): Promise<number> =>
      new Promise((resolve, reject) => {
        client.GetStats(
          { name, reset: false },
          (err: grpc.ServiceError | null, res: { stat?: { value?: unknown } } | null) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(parseStatValue(res?.stat?.value));
          },
        );
      });

    try {
      const uplinkName = `user>>>${email}>>>traffic>>>uplink`;
      const downlinkName = `user>>>${email}>>>traffic>>>downlink`;
      const [up, down] = await Promise.all([
        getValue(uplinkName),
        getValue(downlinkName),
      ]);
      const total = up + down;
      return { up, down, total };
    } finally {
      if (typeof (client as any).close === 'function') (client as any).close();
    }
  }

  /**
   * Статистика пользователя из Xray через QueryStats (один вызов по pattern).
   * Подключение по сырому gRPC TCP к host:port. Не использует панель.
   */
  async getUserTraffic(host: string, port: number, email: string): Promise<UserTrafficResult> {
    const packageDef = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(packageDef) as any;
    const StatsService = proto.xray?.app?.stats?.command?.StatsService;
    if (!StatsService) {
      this.logger.warn('Xray stats proto package not found');
      throw new Error('Xray stats proto not loaded');
    }

    const address = `${host}:${port}`;
    const client = new StatsService(address, grpc.credentials.createInsecure(), {
      'grpc.max_receive_message_length': 4 * 1024 * 1024,
    });

    const pattern = `user>>>${email}`;
    // reset: false — читаем накопительные счётчики, не сбрасываем (значение только растёт до перезапуска Xray)
    const response = await new Promise<{ stat?: Array<{ name?: string; value?: string | number }> }>((resolve, reject) => {
      client.QueryStats(
        { pattern, reset: false },
        (err: grpc.ServiceError | null, res: any) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(res ?? {});
        },
      );
    });

    try {
      const stats = response?.stat ?? [];
      let uplink = 0;
      let downlink = 0;
      for (const s of stats) {
        const name = String(s?.name ?? '').trim();
        const value = parseStatValue(s?.value);
        if (name.endsWith('>>>traffic>>>uplink')) uplink += value;
        else if (name.endsWith('>>>traffic>>>downlink')) downlink += value;
      }
      // Диагностика при 0,0: раз в 10 мин на email — смотрим, у кого в Xray есть трафик (возможно другой ключ).
      if (stats.length >= 2 && uplink === 0 && downlink === 0) {
        const now = Date.now();
        const last = this.lastZeroTrafficDiagnostic.get(`zero:${email}`) ?? 0;
        if (now - last > ZERO_TRAFFIC_DIAGNOSTIC_THROTTLE_MS) {
          this.lastZeroTrafficDiagnostic.set(`zero:${email}`, now);
          try {
            const allResponse = await new Promise<{ stat?: Array<{ name?: string; value?: unknown }> }>((resolve, reject) => {
              client.QueryStats({ pattern: 'user>>>', reset: false }, (err: grpc.ServiceError | null, res: any) => {
                if (err) return reject(err);
                resolve(res ?? {});
              });
            });
            const allStats = allResponse?.stat ?? [];
            const byUser = new Map<string, { up: number; down: number }>();
            for (const s of allStats) {
              const name = String(s?.name ?? '').trim();
              const value = parseStatValue(s?.value);
              const m = name.match(/^user>>>(.+?)>>>traffic>>>(uplink|downlink)$/);
              if (m) {
                const [, userKey, dir] = m;
                if (!byUser.has(userKey)) byUser.set(userKey, { up: 0, down: 0 });
                const cur = byUser.get(userKey)!;
                if (dir === 'uplink') cur.up += value;
                else cur.down += value;
              }
            }
            const withTraffic = [...byUser.entries()].filter(([, v]) => v.up > 0 || v.down > 0);
            if (withTraffic.length > 0) {
              this.logger.warn(
                `Xray traffic is 0 for "${email}". Users with non-zero traffic: ${JSON.stringify(withTraffic.slice(0, 10))}.`,
              );
            }
          } catch {
            // ignore
          }
        }
      }
      const total = uplink + downlink;
      return { uplink, downlink, total };
    } finally {
      if (typeof (client as any).close === 'function') (client as any).close();
    }
  }

  /**
   * Список онлайн-пользователей (email) из Xray GetAllOnlineUsers.
   * В policy должен быть statsUserOnline: true. Онлайн = активность за последние 20 сек.
   */
  async getOnlineUsers(host: string, port: number): Promise<string[]> {
    const packageDef = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(packageDef) as any;
    const StatsService = proto.xray?.app?.stats?.command?.StatsService;
    if (!StatsService) {
      this.logger.warn('Xray stats proto package not found');
      throw new Error('Xray stats proto not loaded');
    }

    const address = `${host}:${port}`;
    const client = new StatsService(address, grpc.credentials.createInsecure(), {
      'grpc.max_receive_message_length': 4 * 1024 * 1024,
    });

    try {
      const response = await new Promise<{ users?: string[]; Users?: string[] }>((resolve, reject) => {
        client.GetAllOnlineUsers({}, (err: grpc.ServiceError | null, res: any) => {
          if (err) {
            if (err.code === grpc.status.UNIMPLEMENTED) {
              this.logger.warn(`GetAllOnlineUsers not supported on ${address}, update Xray to a version with StatsService.GetAllOnlineUsers`);
              resolve({ users: [] });
              return;
            }
            reject(err);
            return;
          }
          resolve(res ?? {});
        });
      });
      const list = response?.users ?? response?.Users ?? [];
      const users = Array.isArray(list) ? list : [];
      return users;
    } finally {
      if (typeof (client as any).close === 'function') (client as any).close();
    }
  }
}
