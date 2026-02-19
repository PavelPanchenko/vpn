import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as https from 'https';
import * as http from 'http';

export type PanelAuth = { cookie?: string; token?: string };

@Injectable()
export class XuiService {
  private readonly logger = new Logger(XuiService.name);
  private readonly httpAgent = new http.Agent({ keepAlive: true });
  private readonly httpsAgent = new https.Agent({ keepAlive: true, rejectUnauthorized: false });

  private normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/$/, '');
  }

  private authHeaders(auth: PanelAuth): Record<string, string> {
    if (auth.cookie) return { Cookie: auth.cookie };
    if (auth.token) return { Authorization: `Bearer ${auth.token}` };
    return {};
  }

  private async withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i <= retries; i++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  }

  async login(baseUrl: string, username: string, password: string): Promise<PanelAuth> {
    const url = `${this.normalizeBaseUrl(baseUrl)}/login`;
    const res = await this.withRetry(() =>
      axios.post<{ success?: boolean; msg?: string }>(
        url,
        { username, password },
        {
          maxRedirects: 0,
          validateStatus: (s) => s >= 200 && s < 400,
          timeout: 15_000,
          httpAgent: this.httpAgent,
          httpsAgent: this.httpsAgent,
        },
      ),
    );
    const cookie = res.headers['set-cookie']?.[0]?.split(';')[0];
    const token = (res.data as any)?.token;
    return { cookie: cookie ?? undefined, token };
  }

  async listInbounds(baseUrl: string, auth: PanelAuth): Promise<any[]> {
    const url = `${this.normalizeBaseUrl(baseUrl)}/panel/api/inbounds/list`;
    const res = await this.withRetry(() =>
      axios.get<any>(url, {
        headers: this.authHeaders(auth),
        timeout: 15_000,
        httpAgent: this.httpAgent,
        httpsAgent: this.httpsAgent,
        validateStatus: (s) => s === 200,
      }),
    );
    const data = res.data;
    if (Array.isArray(data)) return data;
    if (data?.obj != null && Array.isArray(data.obj)) return data.obj;
    return [];
  }

  async getInbound(baseUrl: string, inboundId: number, auth: PanelAuth): Promise<any> {
    const url = `${this.normalizeBaseUrl(baseUrl)}/panel/api/inbounds/get/${inboundId}`;
    const res = await this.withRetry(() =>
      axios.get<any>(url, {
        headers: this.authHeaders(auth),
        timeout: 15_000,
        httpAgent: this.httpAgent,
        httpsAgent: this.httpsAgent,
        validateStatus: (s) => s === 200,
      }),
    );
    const data = res.data;
    const obj = data?.obj ?? data;
    const clientStats =
      obj?.clientStats ??
      obj?.client_stats ??
      (Array.isArray((data as any)?.clientStats) ? (data as any).clientStats : null) ??
      (Array.isArray((data as any)?.client_stats) ? (data as any).client_stats : null) ??
      (Array.isArray((data as any)?.result?.clientStats) ? (data as any).result.clientStats : null) ??
      (Array.isArray((data as any)?.result?.client_stats) ? (data as any).result.client_stats : null) ??
      [];
    return { ...obj, clientStats: Array.isArray(clientStats) ? clientStats : [] };
  }

  async getClientTraffic(
    baseUrl: string,
    auth: PanelAuth,
    inboundId: number,
    email: string,
    uuid?: string,
    // serverId оставлен для совместимости вызовов, но на трафик через панель не влияет
    _serverId?: string,
  ): Promise<{ up: number; down: number; total: number; reset: number; lastOnline: number }> {
    const inbound = await this.getInbound(baseUrl, inboundId, auth);
    const settings = typeof inbound.settings === 'string' ? JSON.parse(inbound.settings) : inbound.settings;
    const clients = settings?.clients || [];
    const emailNorm = String(email ?? '').trim().toLowerCase();

    let client = clients.find((c: any) => String(c?.email ?? c?.Email ?? '').trim().toLowerCase() === emailNorm);
    if (!client && uuid) client = clients.find((c: any) => (c?.id ?? c?.Id) === uuid);

    if (!client) {
      this.logger.warn(`getClientTraffic: client not found (email=${email}${uuid ? `, uuid=${uuid}` : ''})`);
      throw new BadRequestException('Client not found in panel');
    }

    const clientStats = inbound.clientStats ?? inbound.client_stats ?? [];
    const hasClientStats = Array.isArray(clientStats) && clientStats.length > 0;
    let stats: any = null;
    if (hasClientStats) {
      // В clientStats панели id часто числовой, uuid — строка клиента; ищем по uuid в первую очередь
      if (client.id) stats = clientStats.find((s: any) => s?.uuid === client.id);
      if (!stats) stats = clientStats.find((s: any) => String(s?.email ?? s?.Email ?? '').trim().toLowerCase() === emailNorm);
      if (!stats && (client.email ?? client.Email)) {
        const clientEmailNorm = String(client.email ?? client.Email ?? '').trim().toLowerCase();
        stats = clientStats.find((s: any) => String(s?.email ?? s?.Email ?? '').trim().toLowerCase() === clientEmailNorm);
      }
    }

    let up: number;
    let down: number;
    let totalUsed: number;
    let reset: number;
    let lastOnline: number;

    if (stats) {
      const t = stats?.traffic ?? stats?.Traffic;
      up = Number(stats?.up ?? stats?.Up ?? t?.up ?? t?.Up ?? 0);
      down = Number(stats?.down ?? stats?.Down ?? t?.down ?? t?.Down ?? 0);
      const allTime = Number(stats?.allTime ?? stats?.all_time ?? 0);
      totalUsed = allTime > 0 ? allTime : up + down;
      reset = Number(stats?.reset ?? stats?.Reset ?? 0);
      lastOnline = Number(stats?.lastOnline ?? stats?.last_online ?? 0);
    } else {
      // Панель без clientStats: трафик только на уровне инбаунда. Использовать его можно только если в инбаунде ровно один клиент.
      if (clients.length === 1) {
        up = Number(inbound.up ?? 0);
        down = Number(inbound.down ?? 0);
        const allTime = Number(inbound.allTime ?? 0);
        totalUsed = allTime > 0 ? allTime : up + down;
      } else {
        up = 0;
        down = 0;
        totalUsed = 0;
      }
      reset = Number(client?.reset ?? 0);
      lastOnline = 0;
    }

    return { up, down, total: totalUsed, reset, lastOnline };
  }

  async resetClientTraffic(baseUrl: string, auth: PanelAuth, inboundId: number, email: string): Promise<void> {
    const url = `${this.normalizeBaseUrl(baseUrl)}/panel/api/inbounds/${inboundId}/resetClientTraffic/${encodeURIComponent(email)}`;
    await this.withRetry(() =>
      axios.post(url, null, {
        headers: this.authHeaders(auth),
        timeout: 15_000,
        httpAgent: this.httpAgent,
        httpsAgent: this.httpsAgent,
        validateStatus: (s) => s >= 200 && s < 400,
      }),
    );
  }

  async addClient(
    baseUrl: string,
    auth: PanelAuth,
    inboundId: number,
    client: { id: string; email: string; flow?: string; expiryTime?: number; enable?: boolean; limitIp?: number },
  ): Promise<any> {
    const inbound = await this.getInbound(baseUrl, inboundId, auth);
    const settings = typeof inbound.settings === 'string' ? JSON.parse(inbound.settings) : inbound.settings;
    const clients = settings?.clients ?? [];
    if (clients.some((c: any) => (c.email ?? c.Email) === client.email)) {
      throw new BadRequestException('Client already exists');
    }
    const obj: Record<string, unknown> = {
      id: client.id,
      email: client.email,
      flow: client.flow ?? '',
      totalGB: 0, // неограниченный трафик; лимит только по сроку (expiryTime)
    };
    if (client.expiryTime != null && client.expiryTime > 0) {
      obj.expiryTime = client.expiryTime;
      obj.expire = Math.floor(client.expiryTime / 1000);
    }
    if (client.enable !== undefined) obj.enable = client.enable;
    if (client.limitIp !== undefined && client.limitIp > 0) obj.limitIp = client.limitIp;
    clients.push(obj);

    const url = `${this.normalizeBaseUrl(baseUrl)}/panel/api/inbounds/update/${inboundId}`;
    const body = { ...inbound, settings: JSON.stringify({ ...settings, clients }) };
    const res = await axios.post<any>(url, body, {
      headers: { ...this.authHeaders(auth), 'Content-Type': 'application/json' },
      timeout: 15_000,
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      validateStatus: (s) => s === 200,
    });
    if (res.data?.success === false) throw new BadRequestException(res.data?.msg ?? 'Panel update failed');
    return res.data;
  }

  async updateClient(
    baseUrl: string,
    auth: PanelAuth,
    inboundId: number,
    email: string,
    patch: { email?: string; flow?: string; expiryTime?: number; enable?: boolean; limitIp?: number; totalGB?: number },
  ): Promise<any> {
    const inbound = await this.getInbound(baseUrl, inboundId, auth);
    const settings = typeof inbound.settings === 'string' ? JSON.parse(inbound.settings) : inbound.settings;
    const clients = settings?.clients ?? [];
    const idx = clients.findIndex((c: any) => (c.email ?? c.Email) === email);
    if (idx < 0) throw new BadRequestException('Client not found');
    if (patch.email != null) clients[idx].email = patch.email;
    if (patch.flow != null) clients[idx].flow = patch.flow;
    if (patch.expiryTime !== undefined) {
      clients[idx].expiryTime = patch.expiryTime;
      clients[idx].expire = patch.expiryTime > 0 ? Math.floor(patch.expiryTime / 1000) : 0;
    }
    if (patch.enable !== undefined) clients[idx].enable = patch.enable;
    if (patch.limitIp !== undefined) clients[idx].limitIp = patch.limitIp > 0 ? patch.limitIp : 0;
    if (patch.totalGB !== undefined) clients[idx].totalGB = patch.totalGB;

    const url = `${this.normalizeBaseUrl(baseUrl)}/panel/api/inbounds/update/${inboundId}`;
    const body = { ...inbound, settings: JSON.stringify({ ...settings, clients }) };
    const res = await axios.post<any>(url, body, {
      headers: { ...this.authHeaders(auth), 'Content-Type': 'application/json' },
      timeout: 15_000,
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      validateStatus: (s) => s === 200,
    });
    if (res.data?.success === false) throw new BadRequestException(res.data?.msg ?? 'Panel update failed');
    return res.data;
  }

  async deleteClient(baseUrl: string, auth: PanelAuth, inboundId: number, email: string): Promise<any> {
    const inbound = await this.getInbound(baseUrl, inboundId, auth);
    const settings = typeof inbound.settings === 'string' ? JSON.parse(inbound.settings) : inbound.settings;
    const clients = (settings?.clients ?? []).filter((c: any) => (c.email ?? c.Email) !== email);
    if (clients.length === (settings?.clients ?? []).length) {
      throw new BadRequestException('Client not found');
    }
    const url = `${this.normalizeBaseUrl(baseUrl)}/panel/api/inbounds/update/${inboundId}`;
    const body = { ...inbound, settings: JSON.stringify({ ...settings, clients }) };
    const res = await axios.post<any>(url, body, {
      headers: { ...this.authHeaders(auth), 'Content-Type': 'application/json' },
      timeout: 15_000,
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      validateStatus: (s) => s === 200,
    });
    if (res.data?.success === false) throw new BadRequestException(res.data?.msg ?? 'Panel delete failed');
    return res.data;
  }
}

