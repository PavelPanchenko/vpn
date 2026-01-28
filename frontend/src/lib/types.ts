export type VpnServer = {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: 'VLESS';
  transport: 'WS' | 'TCP';
  tls: boolean;
  security?: 'NONE' | 'TLS' | 'REALITY';
  sni?: string | null;
  path: string | null;
  publicKey: string;
  shortId: string;
  panelBaseUrl?: string | null;
  panelUsername?: string | null;
  panelInboundId?: number | null;
  maxUsers: number;
  active: boolean;
  createdAt: string;
  usersCount?: number;
  activeUsersCount?: number;
  freeSlots?: number | null;
};

export type VpnUserStatus = 'ACTIVE' | 'BLOCKED' | 'EXPIRED';

export type UserServer = {
  id: string;
  vpnUserId: string;
  serverId: string;
  panelEmail: string;
  active: boolean;
  isActive: boolean; // Текущая активная локация
  createdAt: string;
  server: VpnServer;
};

export type VpnUser = {
  id: string;
  name: string;
  telegramId: string | null;
  uuid: string;
  status: VpnUserStatus;
  expiresAt: string | null;
  firstPaidAt: string | null; // Дата первого успешного платежа (для разделения новых/существующих пользователей)
  serverId: string | null;
  createdAt: string;
  server?: VpnServer | null;
  userServers?: UserServer[];
};

export type Subscription = {
  id: string;
  vpnUserId: string;
  periodDays: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
};

export type PaymentStatus = 'PAID' | 'FAILED';

export type Plan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  periodDays: number;
  price: number;
  currency: string;
  isTrial: boolean;
  active: boolean;
  legacy: boolean;
  availableFor: 'ALL' | 'NEW_USERS' | 'EXISTING_USERS';
  createdAt: string;
};

export type Payment = {
  id: string;
  vpnUserId: string;
  planId: string | null;
  amount: number;
  currency: string;
  planPriceAtPurchase: number | null; // Цена тарифа на момент покупки
  status: PaymentStatus;
  createdAt: string;
  plan?: Plan | null;
  vpnUser?: VpnUser | null;
};

