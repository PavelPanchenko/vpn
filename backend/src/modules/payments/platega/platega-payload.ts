import * as crypto from 'crypto';

export type PlategaPayloadData = {
  v: 1;
  intentId: string;
  vpnUserId: string;
  planId: string;
  variantId: string;
  issuedAt: number;
};

function b64urlEncode(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(padLen);
  return Buffer.from(base64, 'base64').toString('utf8');
}

export function buildPlategaPayload(args: PlategaPayloadData & { secret: string }): string {
  const data: PlategaPayloadData = {
    v: 1,
    intentId: args.intentId,
    vpnUserId: args.vpnUserId,
    planId: args.planId,
    variantId: args.variantId,
    issuedAt: args.issuedAt,
  };
  const json = JSON.stringify(data);
  const blob = b64urlEncode(json);
  const base = `p1.${blob}`;
  const sig = crypto.createHmac('sha256', args.secret).update(base).digest('hex');
  return `${base}.${sig}`;
}

export function verifyPlategaPayload(args: { payload: string; secret: string }): PlategaPayloadData | null {
  const p = String(args.payload ?? '').trim();
  const m = p.match(/^p1\.([A-Za-z0-9_-]+)\.([a-f0-9]{64})$/);
  if (!m) return null;
  const [, blob, sig] = m;
  const base = `p1.${blob}`;
  const expected = crypto.createHmac('sha256', args.secret).update(base).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(sig, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const json = b64urlDecode(blob);
    const data = JSON.parse(json) as PlategaPayloadData;
    if (!data || data.v !== 1) return null;
    if (!data.intentId || !data.vpnUserId || !data.planId || !data.variantId) return null;
    if (typeof data.issuedAt !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

