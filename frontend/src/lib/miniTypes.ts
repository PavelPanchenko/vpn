export type MiniServer = {
  id: string;
  name: string;
  freeSlots?: number | null;
  isRecommended?: boolean;
};

export type MiniPlan = {
  id: string;
  name: string;
  price: number;
  currency: string;
  periodDays: number;
  description?: string | null;
  isTop?: boolean;
};

export type MiniSubscription = {
  id: string;
  periodDays: number;
  startsAt: string;
  endsAt: string;
};

export type MiniStatus = {
  id: string;
  status: string;
  expiresAt: string | null;
  daysLeft: number | null;
  progressLeftPct?: number | null;
  trafficUsed: number | null;
  servers: { id: string; name: string }[];
  botName?: string;
  botUsername?: string | null;
  subscription: MiniSubscription | null;
};

export type MiniConfigResponse = {
  configs?: Array<{ url: string; serverName?: string }>;
};

export type MiniPayResponse =
  | {
      provider: 'TELEGRAM_STARS';
      invoiceLink: string;
    }
  | {
      provider: 'PLATEGA';
      paymentUrl: string;
    }
  | {
      // legacy / future providers
      paymentId: string;
      status: string;
    };

