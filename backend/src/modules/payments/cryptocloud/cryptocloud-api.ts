const CRYPTOCLOUD_BASE_URL = 'https://api.cryptocloud.plus';

export type CryptoCloudCreateInvoiceRequest = {
  shop_id: string;
  amount: number | string;
  currency?: string;
  order_id?: string;
  email?: string;
  add_fields?: Record<string, any>;
};

export type CryptoCloudCreateInvoiceResponse = {
  status: 'success' | 'error';
  result?: {
    uuid?: string; // INV-xxxx
    invoice_id?: string | null;
    link?: string;
    expiry_date?: string;
    status?: string;
    amount?: number;
    amount_usd?: number;
    amount_in_fiat?: number;
    fiat_currency?: string;
    [k: string]: any;
  };
};

export async function cryptocloudCreateInvoice(args: {
  apiKey: string;
  locale?: 'ru' | 'en';
  body: CryptoCloudCreateInvoiceRequest;
}): Promise<CryptoCloudCreateInvoiceResponse> {
  const url = new URL('/v2/invoice/create', CRYPTOCLOUD_BASE_URL);
  if (args.locale) url.searchParams.set('locale', args.locale);

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { Authorization: `Token ${args.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(args.body),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`CryptoCloud create invoice failed: ${res.status} ${text}`.trim());
  }
  try {
    return JSON.parse(text) as CryptoCloudCreateInvoiceResponse;
  } catch {
    throw new Error(`CryptoCloud create invoice invalid JSON: ${text}`.trim());
  }
}

export function parseCryptoCloudDateUtc(value: string | undefined | null): Date | null {
  const v = String(value ?? '').trim();
  if (!v) return null;
  // expected: "2024-08-22 11:49:59.756692" (UTC+0)
  const m = v.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.(\d+))?$/);
  if (!m) return null;
  const date = m[1];
  const time = m[2];
  const micros = m[4] || '';
  const ms = micros ? micros.slice(0, 3).padEnd(3, '0') : '000';
  const iso = `${date}T${time}.${ms}Z`;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

