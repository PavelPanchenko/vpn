import crypto from 'crypto';

function base64UrlToBuffer(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  const padded = pad === 0 ? normalized : normalized + '='.repeat(4 - pad);
  return Buffer.from(padded, 'base64');
}

function base64UrlFromBuffer(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function timingSafeEqualString(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

export type CryptoCloudPostbackBody = {
  status?: string;
  invoice_id?: string;
  amount_crypto?: number | string;
  currency?: string;
  order_id?: string;
  token?: string;
  invoice_info?: { uuid?: string; amount_usd?: number; status?: string } | Record<string, any>;
  [k: string]: any;
};

export type CryptoCloudPostbackTokenPayload = {
  exp?: number;
  iat?: number;
  // docs say UUID of invoice is included, but exact key isn't guaranteed; keep it flexible
  uuid?: string;
  invoice_uuid?: string;
  invoice_id?: string;
  [k: string]: any;
};

export function verifyCryptoCloudPostbackToken(args: { token: string; secret: string }): CryptoCloudPostbackTokenPayload | null {
  const raw = String(args.token || '').trim();
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;

  const [hB64, pB64, sigB64] = parts;
  const header = safeJsonParse<{ alg?: string }>(base64UrlToBuffer(hB64).toString('utf8'));
  if (!header || String(header.alg).toUpperCase() !== 'HS256') return null;

  const dataToSign = `${hB64}.${pB64}`;
  const expected = base64UrlFromBuffer(crypto.createHmac('sha256', args.secret).update(dataToSign).digest());
  if (!timingSafeEqualString(expected, sigB64)) return null;

  const payload = safeJsonParse<CryptoCloudPostbackTokenPayload>(base64UrlToBuffer(pB64).toString('utf8'));
  if (!payload) return null;

  // exp is in seconds (JWT standard)
  if (typeof payload.exp === 'number') {
    const now = Math.floor(Date.now() / 1000);
    if (now > payload.exp) return null;
  }

  return payload;
}

