"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.XuiService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("axios");
const http = require("node:http");
const https = require("node:https");
let XuiService = class XuiService {
    httpAgent = new http.Agent({ keepAlive: true });
    httpsAgent = new https.Agent({ keepAlive: true });
    normalizeBaseUrl(baseUrl) {
        return baseUrl.replace(/\/+$/, '');
    }
    isRetryableNetworkError(err) {
        const e = err;
        const code = e?.code;
        return (code === 'ECONNRESET' ||
            code === 'ETIMEDOUT' ||
            code === 'ECONNREFUSED' ||
            code === 'EAI_AGAIN' ||
            code === 'ENOTFOUND');
    }
    async withRetry(fn, retries = 2, delayMs = 350) {
        let lastErr;
        for (let i = 0; i <= retries; i++) {
            try {
                return await fn();
            }
            catch (e) {
                lastErr = e;
                if (!this.isRetryableNetworkError(e) || i === retries)
                    break;
                await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
            }
        }
        throw lastErr;
    }
    buildCookieHeader(setCookies) {
        if (!setCookies || setCookies.length === 0)
            return null;
        const pairs = setCookies
            .map((c) => c.split(';')[0]?.trim())
            .filter(Boolean);
        if (pairs.length === 0)
            return null;
        const sessionFirst = pairs.sort((a, b) => (b.startsWith('session=') ? 1 : 0) - (a.startsWith('session=') ? 1 : 0));
        return sessionFirst.join('; ');
    }
    assertOk(data, action) {
        if (typeof data === 'string' && data.toLowerCase().includes('<html')) {
            throw new common_1.BadRequestException(`Panel ${action} failed (unauthorized)`);
        }
        if (data && typeof data === 'object' && 'success' in data && data.success === false) {
            throw new common_1.BadRequestException(data.msg || `Panel ${action} failed`);
        }
    }
    async login(baseUrl, username, password) {
        const url = `${this.normalizeBaseUrl(baseUrl)}/login`;
        const res = await this.withRetry(() => axios_1.default.post(url, { username, password }, {
            validateStatus: () => true,
            maxRedirects: 0,
            timeout: 15_000,
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent,
        }), 2, 400).catch((e) => {
            const code = e?.code ? ` (${e.code})` : '';
            throw new common_1.BadRequestException(`Panel connection failed during login${code}`);
        });
        const cookie = this.buildCookieHeader(res.headers['set-cookie']);
        const token = res.data?.session_token;
        return { cookie: cookie ?? undefined, token: token ?? undefined };
    }
    async listInbounds(baseUrl, auth) {
        const url = `${this.normalizeBaseUrl(baseUrl)}/panel/api/inbounds/list`;
        const res = await this.withRetry(() => axios_1.default.get(url, {
            validateStatus: () => true,
            headers: auth.cookie ? { Cookie: auth.cookie } : undefined,
            timeout: 15_000,
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent,
        }), 2, 400);
        this.assertOk(res.data, 'listInbounds');
        const list = res.data?.obj ?? res.data?.inbounds ?? [];
        return list;
    }
    async getInbound(baseUrl, inboundId, auth) {
        const url = `${this.normalizeBaseUrl(baseUrl)}/panel/api/inbounds/get/${inboundId}`;
        const res = await this.withRetry(() => axios_1.default.get(url, {
            validateStatus: () => true,
            headers: auth.cookie ? { Cookie: auth.cookie } : undefined,
            timeout: 15_000,
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent,
        }), 2, 400);
        this.assertOk(res.data, 'getInbound');
        return res.data?.obj ?? res.data?.inbound ?? res.data;
    }
    async addClient(baseUrl, auth, inboundId, client) {
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
        const res = await axios_1.default.post(url, { id: inboundId, settings }, {
            validateStatus: () => true,
            headers: auth.cookie ? { Cookie: auth.cookie } : undefined,
            timeout: 15_000,
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent,
        });
        this.assertOk(res.data, 'addClient');
        return res.data;
    }
    async updateClientByEmail(baseUrl, auth, inboundId, email, client) {
        try {
            await this.deleteClientByEmail(baseUrl, auth, inboundId, email);
        }
        catch {
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
    async deleteClientByEmail(baseUrl, auth, inboundId, email) {
        const url = `${this.normalizeBaseUrl(baseUrl)}/panel/api/inbounds/${inboundId}/delClientByEmail/${encodeURIComponent(email)}`;
        const res = await axios_1.default.post(url, null, {
            validateStatus: () => true,
            headers: auth.cookie ? { Cookie: auth.cookie } : undefined,
            timeout: 15_000,
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent,
        });
        if (res.status >= 400) {
            throw new common_1.BadRequestException('Panel deleteClient failed');
        }
        if (res.data && typeof res.data === 'object' && 'success' in res.data && res.data.success === false) {
            throw new common_1.BadRequestException(res.data.msg || 'Panel deleteClient failed');
        }
        return res.data;
    }
    async getClientTraffic(baseUrl, auth, inboundId, email) {
        const inbound = await this.getInbound(baseUrl, inboundId, auth);
        const settings = typeof inbound.settings === 'string' ? JSON.parse(inbound.settings) : inbound.settings;
        const clients = settings?.clients || [];
        const client = clients.find((c) => c.email === email);
        if (!client) {
            throw new common_1.BadRequestException('Client not found in panel');
        }
        const clientStats = inbound.clientStats || [];
        const stats = clientStats.find((s) => s.email === email);
        return {
            email: client.email,
            id: client.id,
            up: stats?.up || 0,
            down: stats?.down || 0,
            total: stats?.allTime || (stats?.up || 0) + (stats?.down || 0),
            reset: stats?.reset || 0,
            lastOnline: stats?.lastOnline || 0,
        };
    }
    async resetClientTraffic(baseUrl, auth, inboundId, email) {
        const url = `${this.normalizeBaseUrl(baseUrl)}/panel/api/inbounds/${inboundId}/resetClientTraffic/${encodeURIComponent(email)}`;
        const res = await this.withRetry(() => axios_1.default.post(url, null, {
            validateStatus: () => true,
            headers: auth.cookie ? { Cookie: auth.cookie } : undefined,
            timeout: 15_000,
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent,
        }), 2, 400);
        this.assertOk(res.data, 'resetClientTraffic');
        return res.data;
    }
};
exports.XuiService = XuiService;
exports.XuiService = XuiService = __decorate([
    (0, common_1.Injectable)()
], XuiService);
//# sourceMappingURL=xui.service.js.map