import crypto from 'crypto';

export type ExternalPaymentSignatureData = {
  userId: string;
  planId: string;
  ts: number; // unix seconds
};

function buildCanonicalQuery(data: ExternalPaymentSignatureData): string {
  // Важно: фиксированный порядок параметров для подписи.
  const params = new URLSearchParams();
  params.set('userId', data.userId);
  params.set('planId', data.planId);
  params.set('ts', String(data.ts));
  return params.toString();
}

export function buildExternalPaymentSignature(args: ExternalPaymentSignatureData & { secret: string }): string {
  const canonical = buildCanonicalQuery(args);
  return crypto.createHmac('sha256', args.secret).update(canonical).digest('base64url');
}

export function verifyExternalPaymentSignature(
  args: ExternalPaymentSignatureData & { sig: string; secret: string; maxAgeSec?: number },
): boolean {
  const maxAgeSec = args.maxAgeSec ?? 15 * 60;
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(args.ts) || Math.abs(now - args.ts) > maxAgeSec) return false;

  const expected = buildExternalPaymentSignature({
    userId: args.userId,
    planId: args.planId,
    ts: args.ts,
    secret: args.secret,
  });

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(args.sig));
  } catch {
    return false;
  }
}

