const PLATEGA_BASE_URL = 'https://app.platega.io';

export type PlategaPaymentStatus = 'PENDING' | 'CONFIRMED' | 'CANCELED' | 'CHARGEBACK';

export type PlategaCallbackPayload = {
  id: string;
  amount: number;
  currency: string;
  status: PlategaPaymentStatus;
  paymentMethod: number;
};

export type PlategaCreateTransactionRequest = {
  paymentMethod: number;
  paymentDetails: { amount: number; currency: string };
  description?: string;
  return?: string;
  failedUrl?: string;
  payload?: string;
};

export type PlategaCreateTransactionResponse = {
  paymentMethod: string;
  transactionId: string;
  redirect: string;
  return?: string;
  paymentDetails?: string;
  status: PlategaPaymentStatus;
  expiresIn?: string;
  merchantId?: string;
  usdtRate?: number;
};

function getAuthHeaders(merchantId: string, secret: string): Record<string, string> {
  if (!merchantId || !secret) {
    throw new Error('Platega is not configured (PLATEGA_MERCHANT_ID / PLATEGA_SECRET)');
  }
  return {
    'X-MerchantId': merchantId,
    'X-Secret': secret,
    'content-type': 'application/json',
  };
}

export async function plategaCreateTransaction(args: {
  merchantId: string;
  secret: string;
  body: PlategaCreateTransactionRequest;
}): Promise<PlategaCreateTransactionResponse> {
  const res = await fetch(`${PLATEGA_BASE_URL}/transaction/process`, {
    method: 'POST',
    headers: getAuthHeaders(args.merchantId, args.secret),
    body: JSON.stringify(args.body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Platega create transaction failed: ${res.status} ${text}`.trim());
  }
  return (await res.json()) as PlategaCreateTransactionResponse;
}
