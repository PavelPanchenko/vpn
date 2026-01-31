import type { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PaymentsService } from '../../payments/payments.service';
import type { PlansService } from '../../plans/plans.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SupportService } from '../../support/support.service';
import type { UsersService } from '../../users/users.service';
import type { TelegramBot, TelegramCallbackCtx, TelegramMessageCtx, TelegramReplyOptions } from '../telegram-runtime.types';
import type { PlanLike } from '../bot-domain.types';

type UserForConfigMessage = {
  id: string;
  status?: string | null;
} | null;

export type TelegramRegistrarDeps = {
  bot: TelegramBot;
  logger: Logger;
  config: ConfigService;
  prisma: PrismaService;

  usersService: UsersService;
  plansService: PlansService;
  paymentsService: PaymentsService;
  supportService: SupportService;

  supportModeUsers: Map<string, boolean>;

  // Telegram message helpers
  replyHtml: (ctx: TelegramMessageCtx, html: string, extra?: TelegramReplyOptions) => Promise<unknown>;
  editHtml: (ctx: TelegramCallbackCtx, html: string, extra?: TelegramReplyOptions) => Promise<unknown>;

  // High-level bot helpers
  sendConfigMessage: (ctx: TelegramMessageCtx, user: UserForConfigMessage) => Promise<unknown>;
  enableSupportMode: (ctx: TelegramMessageCtx, telegramId: string) => Promise<unknown>;
  showMainMenu: (ctx: TelegramMessageCtx, user: { id: string } & Record<string, unknown>) => Promise<unknown>;
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

