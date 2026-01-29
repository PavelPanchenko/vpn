"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var XuiService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.XuiService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("axios");
const https = require("https");
const http = require("http");
let XuiService = XuiService_1 = class XuiService {
    logger = new common_1.Logger(XuiService_1.name);
    httpAgent = new http.Agent({ keepAlive: true });
    httpsAgent = new https.Agent({ keepAlive: true, rejectUnauthorized: false });
    normalizeBaseUrl(baseUrl) {
        return baseUrl.replace(/\/$/, '');
    }
    authHeaders(auth) {
        if (auth.cookie)
            return { Cookie: auth.cookie };
        if (auth.token)
            return { Authorization: `Bearer ${auth.token}` };
        return {};
    }
    async withRetry(fn, retries = 2) {
        let lastErr;
        for (let i = 0; i <= retries; i++) {
            try {
                return await fn();
            }
            catch (e) {
                lastErr = e;
            }
        }
        throw lastErr;
    }
    async login(baseUrl, username, password) {
        const url = `${this.normalizeBaseUrl(baseUrl)}/login`;
        const res = await this.withRetry(() => axios_1.default.post(url, { username, password }, {
            maxRedirects: 0,
            validateStatus: (s) => s >= 200 && s < 400,
            timeout: 15_000,
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent,
        }));
        const cookie = res.headers['set-cookie']?.[0]?.split(';')[0];
        const token = res.data?.token;
        return { cookie: cookie ?? undefined, token };
    }
    async listInbounds(baseUrl, auth) {
        const url = `${this.normalizeBaseUrl(baseUrl)}/panel/api/inbounds/list`;
        const res = await this.withRetry(() => axios_1.default.get(url, {
            headers: this.authHeaders(auth),
            timeout: 15_000,
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent,
            validateStatus: (s) => s === 200,
        }));
        const data = res.data;
        if (Array.isArray(data))
            return data;
        if (data?.obj != null && Array.isArray(data.obj))
            return data.obj;
        return [];
    }
    async getInbound(baseUrl, inboundId, auth) {
        const url = `${this.normalizeBaseUrl(baseUrl)}/panel/api/inbounds/get/${inboundId}`;
        const res = await this.withRetry(() => axios_1.default.get(url, {
            headers: this.authHeaders(auth),
            timeout: 15_000,
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent,
            validateStatus: (s) => s === 200,
        }));
        const data = res.data;
        const obj = data?.obj ?? data;
        const clientStats = obj?.clientStats ?? obj?.client_stats ?? (Array.isArray(data?.clientStats) ? data.clientStats : []);
        return { ...obj, clientStats };
    }
    async getClientTraffic(baseUrl, auth, inboundId, email) {
        const inbound = await this.getInbound(baseUrl, inboundId, auth);
        const settings = typeof inbound.settings === 'string' ? JSON.parse(inbound.settings) : inbound.settings;
        const clients = settings?.clients || [];
        const client = clients.find((c) => (c.email ?? c.Email) === email);
        if (!client) {
            this.logger.warn(`getClientTraffic: client not found (email=${email})`);
            throw new common_1.BadRequestException('Client not found in panel');
        }
        const clientStats = inbound.clientStats ?? inbound.client_stats ?? [];
        let stats = clientStats.find((s) => (s.email ?? s.Email) === email);
        if (!stats && client.id)
            stats = clientStats.find((s) => (s.id ?? s.Id) === client.id);
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
    async resetClientTraffic(baseUrl, auth, inboundId, email) {
        const url = `${this.normalizeBaseUrl(baseUrl)}/panel/api/inbounds/${inboundId}/resetClientTraffic/${encodeURIComponent(email)}`;
        await this.withRetry(() => axios_1.default.post(url, null, {
            headers: this.authHeaders(auth),
            timeout: 15_000,
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent,
            validateStatus: (s) => s >= 200 && s < 400,
        }));
    }
    async addClient(baseUrl, auth, inboundId, client) {
        const inbound = await this.getInbound(baseUrl, inboundId, auth);
        const settings = typeof inbound.settings === 'string' ? JSON.parse(inbound.settings) : inbound.settings;
        const clients = settings?.clients ?? [];
        if (clients.some((c) => (c.email ?? c.Email) === client.email)) {
            throw new common_1.BadRequestException('Client already exists');
        }
        const obj = {
            id: client.id,
            email: client.email,
            flow: client.flow ?? '',
        };
        if (client.expiryTime != null && client.expiryTime > 0) {
            obj.expiryTime = client.expiryTime;
            obj.expire = Math.floor(client.expiryTime / 1000);
        }
        if (client.enable !== undefined)
            obj.enable = client.enable;
        clients.push(obj);
        const url = `${this.normalizeBaseUrl(baseUrl)}/panel/api/inbounds/update/${inboundId}`;
        const body = { ...inbound, settings: JSON.stringify({ ...settings, clients }) };
        const res = await axios_1.default.post(url, body, {
            headers: { ...this.authHeaders(auth), 'Content-Type': 'application/json' },
            timeout: 15_000,
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent,
            validateStatus: (s) => s === 200,
        });
        if (res.data?.success === false)
            throw new common_1.BadRequestException(res.data?.msg ?? 'Panel update failed');
        return res.data;
    }
    async updateClient(baseUrl, auth, inboundId, email, patch) {
        const inbound = await this.getInbound(baseUrl, inboundId, auth);
        const settings = typeof inbound.settings === 'string' ? JSON.parse(inbound.settings) : inbound.settings;
        const clients = settings?.clients ?? [];
        const idx = clients.findIndex((c) => (c.email ?? c.Email) === email);
        if (idx < 0)
            throw new common_1.BadRequestException('Client not found');
        if (patch.email != null)
            clients[idx].email = patch.email;
        if (patch.flow != null)
            clients[idx].flow = patch.flow;
        if (patch.expiryTime !== undefined) {
            clients[idx].expiryTime = patch.expiryTime;
            clients[idx].expire = patch.expiryTime > 0 ? Math.floor(patch.expiryTime / 1000) : 0;
        }
        if (patch.enable !== undefined)
            clients[idx].enable = patch.enable;
        const url = `${this.normalizeBaseUrl(baseUrl)}/panel/api/inbounds/update/${inboundId}`;
        const body = { ...inbound, settings: JSON.stringify({ ...settings, clients }) };
        const res = await axios_1.default.post(url, body, {
            headers: { ...this.authHeaders(auth), 'Content-Type': 'application/json' },
            timeout: 15_000,
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent,
            validateStatus: (s) => s === 200,
        });
        if (res.data?.success === false)
            throw new common_1.BadRequestException(res.data?.msg ?? 'Panel update failed');
        return res.data;
    }
    async deleteClient(baseUrl, auth, inboundId, email) {
        const inbound = await this.getInbound(baseUrl, inboundId, auth);
        const settings = typeof inbound.settings === 'string' ? JSON.parse(inbound.settings) : inbound.settings;
        const clients = (settings?.clients ?? []).filter((c) => (c.email ?? c.Email) !== email);
        if (clients.length === (settings?.clients ?? []).length) {
            throw new common_1.BadRequestException('Client not found');
        }
        const url = `${this.normalizeBaseUrl(baseUrl)}/panel/api/inbounds/update/${inboundId}`;
        const body = { ...inbound, settings: JSON.stringify({ ...settings, clients }) };
        const res = await axios_1.default.post(url, body, {
            headers: { ...this.authHeaders(auth), 'Content-Type': 'application/json' },
            timeout: 15_000,
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent,
            validateStatus: (s) => s === 200,
        });
        if (res.data?.success === false)
            throw new common_1.BadRequestException(res.data?.msg ?? 'Panel delete failed');
        return res.data;
    }
};
exports.XuiService = XuiService;
exports.XuiService = XuiService = XuiService_1 = __decorate([
    (0, common_1.Injectable)()
], XuiService);
//# sourceMappingURL=xui.service.js.map