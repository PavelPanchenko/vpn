import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';
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
      axios.post<{ success?: boolean; msg?: string }>(url, { username, password }, {
        maxRedirects: 0,
        validateStatus: (s) => s >= 200 && s < 400,
        timeout: 15_000,
        httpAgent: this.httpAgent,
        httpsAgent: this.httpsAgent,
      }),
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
    const clientStats = obj?.clientStats ?? obj?.client_stats ?? (Array.isArray((data as any)?.clientStats) ? (data as any).clientStats : []);
    return { ...obj, clientStats };
  }

  async getClientTraffic(
    baseUrl: string,
    auth: PanelAuth,
    inboundId: number,
    email: string,
  ): Promise<{ up: number; down: number; total: number; reset: number; lastOnline: number }> {
    const inbound = await this.getInbound(baseUrl, inboundId, auth);
    const settings = typeof inbound.settings === 'string' ? JSON.parse(inbound.settings) : inbound.settings;
    const clients = settings?.clients || [];
    const client = clients.find((c: any) => (c.email ?? c.Email) === email);
    if (!client) {
      this.logger.warn(`getClientTraffic: client not found (email=${email})`);
      throw new BadRequestException('Client not found in panel');
    }
    const clientStats = inbound.clientStats ?? inbound.client_stats ?? [];
    let stats = clientStats.find((s: any) => (s.email ?? s.Email) === email);
    if (!stats && client.id) stats = clientStats.find((s: any) => (s.id ?? s.Id) === client.id);
    const t = stats?.traffic ?? stats?.Traffic;
    const up = Number(stats?.up ?? stats?.Up ?? t?.up ?? t?.Up ?? 0);
    const down = Number(stats?.down ?? stats?.Down ?? t?.down ?? t?.Down ?? 0);
    const allTime = Number(stats?.allTime ?? stats?.all_time ?? 0);
    const totalUsed = allTime > 0 ? allTime : up + down;
    return {
      up,
      down,
      total: totalUsed,
      reset: Number(stats?.reset ?? stats?.Reset ?? 0),
      lastOnline: Number(stats?.lastOnline ?? stats?.last_online ?? 0),
    };
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
    client: { id: string; email: string; flow?: string; expiryTime?: number; enable?: boolean },
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
    };
    if (client.expiryTime != null && client.expiryTime > 0) {
      obj.expiryTime = client.expiryTime;
      obj.expire = Math.floor(client.expiryTime / 1000);
    }
    if (client.enable !== undefined) obj.enable = client.enable;
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
    patch: { email?: string; flow?: string; expiryTime?: number; enable?: boolean },
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
