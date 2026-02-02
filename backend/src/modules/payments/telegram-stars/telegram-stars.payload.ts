import * as crypto from 'crypto';

type StarsPayloadData = {
  intentId: string;
  issuedAt: number; // unix ms
};

function sign(base: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(base).digest('hex').slice(0, 16);
}

export function buildTelegramStarsInvoicePayload(args: StarsPayloadData & { secret: string }): string {
  // Telegram invoice_payload hard limit is 128 bytes.
  // Keep it minimal: intentId + issuedAt + signature.
  const base = `stars:${args.intentId}:${args.issuedAt}`;
  const sig = sign(base, args.secret);
  return `${base}:${sig}`;
}

export function verifyTelegramStarsInvoicePayload(args: { payload: string; secret: string }): StarsPayloadData | null {
  const parts = args.payload.split(':');
  if (parts.length !== 4) return null;
  const [kind, intentId, issuedAtRaw, sig] = parts;
  if (kind !== 'stars') return null;
  const issuedAt = Number(issuedAtRaw);
  if (!intentId || !Number.isFinite(issuedAt)) return null;
  const base = `stars:${intentId}:${issuedAt}`;
  const expected = sign(base, args.secret);
  if (sig !== expected) return null;
  return { intentId, issuedAt };
}

