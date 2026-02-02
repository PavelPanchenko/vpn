import * as crypto from 'crypto';

type StarsPayloadData = {
  intentId: string;
  userId: string;
  planId: string;
  variantId: string;
  issuedAt: number; // unix ms
};

function sign(base: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(base).digest('hex').slice(0, 16);
}

export function buildTelegramStarsInvoicePayload(args: StarsPayloadData & { secret: string }): string {
  const base = `stars:${args.intentId}:${args.userId}:${args.planId}:${args.variantId}:${args.issuedAt}`;
  const sig = sign(base, args.secret);
  return `${base}:${sig}`;
}

export function verifyTelegramStarsInvoicePayload(args: { payload: string; secret: string }): StarsPayloadData | null {
  const parts = args.payload.split(':');
  if (parts.length !== 7) return null;
  const [kind, intentId, userId, planId, variantId, issuedAtRaw, sig] = parts;
  if (kind !== 'stars') return null;
  const issuedAt = Number(issuedAtRaw);
  if (!intentId || !userId || !planId || !variantId || !Number.isFinite(issuedAt)) return null;
  const base = `stars:${intentId}:${userId}:${planId}:${variantId}:${issuedAt}`;
  const expected = sign(base, args.secret);
  if (sig !== expected) return null;
  return { intentId, userId, planId, variantId, issuedAt };
}

