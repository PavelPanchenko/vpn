import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import * as http from 'node:http';
import * as https from 'node:https';

type LoginResponse = {
  session_token?: string;
  success?: boolean;
};

export type XuiInbound = {
  id: number;
  remark?: string;
  enable?: boolean;
  port: number;
  protocol: string;
  settings?: string;
  streamSettings?: string;
  sniffing?: string;
  tag?: string;
  clientStats?: any[];
};

type InboundsListResponse = {
  success?: boolean;
  msg?: string;
  obj?: XuiInbound[];
  inbounds?: XuiInbound[];
};

@Injectable()
export class XuiService {
  private readonly httpAgent = new http.Agent({ keepAlive: true });
  private readonly httpsAgent = new https.Agent({ keepAlive: true });

  private normalizeBaseUrl(baseUrl: string) {
    return baseUrl.replace(/\/+$/, '');
  }

  private isRetryableNetworkError(err: unknown): boolean {
    const e = err as any;
    const code = e?.code as string | undefined;
    return (
      code === 'ECONNRESET' ||
      code === 'ETIMEDOUT' ||
      code === 'ECONNREFUSED' ||
      code === 'EAI_AGAIN' ||
      code === 'ENOTFOUND'
    );
  }

  private async withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 350): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i <= retries; i++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
        if (!this.isRetryableNetworkError(e) || i === retries) break;
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
      }
    }
    throw lastErr;
  }

  private buildCookieHeader(setCookies: string[] | undefined): string | null {
    if (!setCookies || setCookies.length === 0) return null;
    const pairs = setCookies
      .map((c) => c.split(';')[0]?.trim())
      .filter(Boolean) as string[];
    if (pairs.length === 0) return null;
    // Prefer keeping session cookie (if present), but include all pairs.
    const sessionFirst = pairs.sort((a, b) => (b.startsWith('session=') ? 1 : 0) - (a.startsWith('session=') ? 1 : 0));
    return sessionFirst.join('; ');
  }

  private assertOk(data: any, action: string) {
    // Some panels return HTML when unauthenticated; treat it as failure.
    if (typeof data === 'string' && data.toLowerCase().includes('<html')) {
      throw new BadRequestException(`Panel ${action} failed (unauthorized)`);
    }
    if (data && typeof data === 'object' && 'success' in data && data.success === false) {
      throw new BadRequestException(data.msg || `Panel ${action} failed`);
    }
  }

  async login(baseUrl: string, username: string, password: string): Promise<{ cookie?: string; token?: string }> {
    const url = `${this.normalizeBaseUrl(baseUrl)}/login`;

    const res = await this.withRetry(
      () =>
        axios.post<LoginResponse>(
          url,
          { username, password },
          {
            validateStatus: () => true,
            maxRedirects: 0,
            timeout: 15_000,
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent,
          },
        ),
      2,
      400,
    ).catch((e: any) => {
      const code = e?.code ? ` (${e.code})` : '';
      throw new BadRequestException(`Panel connection failed during login${code}`);
    });

    const cookie = this.buildCookieHeader(res.headers['set-cookie']);
    const token = res.data?.session_token;

    return { cookie: cookie ?? undefined, token: token ?? undefined };
  }

  async listInbounds(baseUrl: string, auth: { cookie?: string; token?: string }) {
    const url = `${this.normalizeBaseUrl(baseUrl)}/panel/api/inbounds/list`;

    const res = await this.withRetry(
      () =>
        axios.get<InboundsListResponse>(url, {
          validateStatus: () => true,
          headers: auth.cookie ? { Cookie: auth.cookie } : undefined,
          timeout: 15_000,
          httpAgent: this.httpAgent,
          httpsAgent: this.httpsAgent,
        }),
      2,
      400,
    );

    this.assertOk(res.data, 'listInbounds');
    const list = res.data?.obj ?? res.data?.inbounds ?? [];
    return list;
  }

  async getInbound(baseUrl: string, inboundId: number, auth: { cookie?: string; token?: string }) {
    const url = `${this.normalizeBaseUrl(baseUrl)}/panel/api/inbounds/get/${inboundId}`;
    const res = await this.withRetry(
      () =>
        axios.get<any>(url, {
          validateStatus: () => true,
          headers: auth.cookie ? { Cookie: auth.cookie } : undefined,
          timeout: 15_000,
          httpAgent: this.httpAgent,
          httpsAgent: this.httpsAgent,
        }),
      2,
      400,
    );

    this.assertOk(res.data, 'getInbound');
    // API shapes vary; safest is to return raw
    return res.data?.obj ?? res.data?.inbound ?? res.data;
  }

  async addClient(
    baseUrl: string,
    auth: { cookie?: string; token?: string },
    inboundId: number,
    client: {
      id: string; // uuid
      email: string;
      enable: boolean;
      expiryTime: number; // ms
      flow?: string;
      tgId?: string;
      subId?: string;
      limitIp?: number;
      totalGB?: number;
      comment?: string;
    },
  ) {
    const url = `${this.normalizeBaseUrl(baseUrl)}/panel/api/inbounds/addClient`;

    const settings = JSON.stringify({
      clients: [
        {
          comment: client.comment ?? '',
          email: client.email,
          enable: client.enable,
          expiryTime: client.expiryTime,
          flow: client.flow ?? '',
          id: client.id,
          limitIp: client.limitIp ?? 0,
          subId: client.subId ?? client.email,
          tgId: client.tgId ?? '',
          totalGB: client.totalGB ?? 0,
        },
      ],
    });

    const res = await axios.post<any>(
      url,
      { id: inboundId, settings },
      {
        validateStatus: () => true,
        headers: auth.cookie ? { Cookie: auth.cookie } : undefined,
        timeout: 15_000,
        httpAgent: this.httpAgent,
        httpsAgent: this.httpsAgent,
      },
    );

    this.assertOk(res.data, 'addClient');
    return res.data;
  }

  async updateClientByEmail(
    baseUrl: string,
    auth: { cookie?: string; token?: string },
    inboundId: number,
    email: string,
    client: {
      id: string; // uuid
      enable: boolean;
      expiryTime: number; // ms
      flow?: string;
      tgId?: string;
      subId?: string;
      limitIp?: number;
      totalGB?: number;
      comment?: string;
    },
  ) {
    // Некоторые версии x-ui / x-ui-pro нестабильно работают с /updateClient
    // и возвращают "empty client ID". Более надёжная стратегия: пере-создать
    // клиента через deleteClientByEmail + addClient с теми же полями.
    try {
      await this.deleteClientByEmail(baseUrl, auth, inboundId, email);
    } catch {
      // Если удалить не удалось (нет клиента и т.п.) — продолжаем, addClient сам создаст нового.
    }

    return this.addClient(baseUrl, auth, inboundId, {
      id: client.id,
      email,
      enable: client.enable,
      expiryTime: client.expiryTime,
      flow: client.flow,
      tgId: client.tgId,
      subId: client.subId,
      limitIp: client.limitIp,
      totalGB: client.totalGB,
      comment: client.comment,
    });
  }

  async deleteClientByEmail(
    baseUrl: string,
    auth: { cookie?: string; token?: string },
    inboundId: number,
    email: string,
  ) {
    const url = `${this.normalizeBaseUrl(baseUrl)}/panel/api/inbounds/${inboundId}/delClientByEmail/${encodeURIComponent(
      email,
    )}`;

    const res = await axios.post<any>(url, null, {
      validateStatus: () => true,
      headers: auth.cookie ? { Cookie: auth.cookie } : undefined,
      timeout: 15_000,
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
    });

    // Many panels return {success:boolean,msg:string} or {msg:string}
    if (res.status >= 400) {
      throw new BadRequestException('Panel deleteClient failed');
    }
    if (res.data && typeof res.data === 'object' && 'success' in res.data && res.data.success === false) {
      throw new BadRequestException(res.data.msg || 'Panel deleteClient failed');
    }
    return res.data;
  }

  /**
   * Получает статистику трафика клиента по email
   */
  async getClientTraffic(
    baseUrl: string,
    auth: { cookie?: string; token?: string },
    inboundId: number,
    email: string,
  ) {
    const inbound = await this.getInbound(baseUrl, inboundId, auth);
    
    // Ищем клиента в settings
    const settings = typeof inbound.settings === 'string' ? JSON.parse(inbound.settings) : inbound.settings;
    const clients = settings?.clients || [];
    const client = clients.find((c: any) => c.email === email);
    
    if (!client) {
      throw new BadRequestException('Client not found in panel');
    }

    // Ищем статистику в clientStats
    const clientStats = inbound.clientStats || [];
    const stats = clientStats.find((s: any) => s.email === email);

    return {
      email: client.email,
      id: client.id,
      up: stats?.up || 0, // Upload в байтах
      down: stats?.down || 0, // Download в байтах
      total: stats?.allTime || (stats?.up || 0) + (stats?.down || 0), // Общий трафик
      reset: stats?.reset || 0, // Дата последнего сброса
      lastOnline: stats?.lastOnline || 0, // Последний онлайн
    };
  }

  /**
   * Сбрасывает трафик клиента
   */
  async resetClientTraffic(
    baseUrl: string,
    auth: { cookie?: string; token?: string },
    inboundId: number,
    email: string,
  ) {
    const url = `${this.normalizeBaseUrl(baseUrl)}/panel/api/inbounds/${inboundId}/resetClientTraffic/${encodeURIComponent(
      email,
    )}`;

    const res = await this.withRetry(
      () =>
        axios.post<any>(url, null, {
          validateStatus: () => true,
          headers: auth.cookie ? { Cookie: auth.cookie } : undefined,
          timeout: 15_000,
          httpAgent: this.httpAgent,
          httpsAgent: this.httpsAgent,
        }),
      2,
      400,
    );

    this.assertOk(res.data, 'resetClientTraffic');
    return res.data;
  }
}

