export type PaymentProviderKey = 'TELEGRAM_STARS' | 'EXTERNAL_URL';

export type CreatePaymentIntentArgs = {
  vpnUserId: string;
  planId: string;
};

export type CreatePaymentIntentResult =
  | {
      provider: 'TELEGRAM_STARS';
      type: 'INVOICE_LINK';
      invoiceLink: string;
    }
  | {
      provider: 'EXTERNAL_URL';
      type: 'EXTERNAL_URL';
      paymentUrl: string;
    }
  | {
      provider: PaymentProviderKey;
      type: 'UNSUPPORTED';
      reason: string;
    };

