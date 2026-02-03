import type { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PaymentsService } from '../../payments/payments.service';
import type { PaymentIntentsService } from '../../payments/payment-intents/payment-intents.service';
import type { PlansService } from '../../plans/plans.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SupportService } from '../../support/support.service';
import type { UsersService } from '../../users/users.service';
import type { TelegramBot, TelegramCallbackCtx, TelegramMessageCtx, TelegramReplyOptions } from '../telegram-runtime.types';
import type { PlanLike } from '../bot-domain.types';
import type { UserForConfigMessage } from '../bot-user.types';
import type { ConfigDataResult, SendConfigQrPhotoResult } from '../messages/config.message';

export type TelegramRegistrarDeps = {
  bot: TelegramBot;
  /** Текущий токен, с которым запущен бот (нужен для Payments Stars и подписи payload). */
  botToken: string;
  logger: Logger;
  config: ConfigService;
  prisma: PrismaService;

  usersService: UsersService;
  plansService: PlansService;
  paymentsService: PaymentsService;
  paymentIntentsService: PaymentIntentsService;
  supportService: SupportService;

  supportModeUsers: Map<string, boolean>;

  // Telegram message helpers
  replyHtml: (ctx: TelegramMessageCtx, html: string, extra?: TelegramReplyOptions) => Promise<unknown>;
  editHtml: (ctx: TelegramCallbackCtx, html: string, extra?: TelegramReplyOptions) => Promise<unknown>;

  // High-level bot helpers
  sendConfigMessage: (ctx: TelegramMessageCtx, user: UserForConfigMessage, configMessageExtra?: TelegramReplyOptions) => Promise<unknown>;
  getConfigData: (user: UserForConfigMessage) => Promise<ConfigDataResult>;
  configLinkHtml: (url: string, serverName: string) => string;
  sendConfigQrPhoto: (
    ctx: TelegramMessageCtx & { replyWithPhoto?: (photo: { source: Buffer }, extra?: TelegramReplyOptions) => Promise<unknown> },
    url: string,
    serverName: string,
  ) => Promise<SendConfigQrPhotoResult>;
  enableSupportMode: (ctx: TelegramMessageCtx, telegramId: string) => Promise<unknown>;
  showMainMenu: (ctx: TelegramMessageCtx, user: { id: string } & Record<string, unknown>) => Promise<unknown>;
  showMainMenuEdit: (ctx: TelegramCallbackCtx, user: { id: string } & Record<string, unknown>) => Promise<unknown>;
  buildMainMenuKeyboard: (user: { id?: string } | null) => Promise<TelegramReplyOptions>;

  // UI formatting helpers
  esc: (s: unknown) => string;
  fmtDate: (d: Date) => string;
  maskServerHost: (host: string) => string;
  planBtnLabel: (plan: PlanLike) => string;

  // Trial helpers
  getTrialDaysForUser: (userId: string) => Promise<number>;
  getTrialDaysFromPlans: (plans: PlanLike[]) => number;
};

