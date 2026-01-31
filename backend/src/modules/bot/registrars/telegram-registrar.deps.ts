import type { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PaymentsService } from '../../payments/payments.service';
import type { PlansService } from '../../plans/plans.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SupportService } from '../../support/support.service';
import type { UsersService } from '../../users/users.service';
import type { TelegramBot, TelegramCallbackCtx, TelegramMessageCtx } from '../telegram-runtime.types';

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
  replyHtml: (ctx: TelegramMessageCtx, html: string, extra?: Record<string, unknown>) => Promise<unknown>;
  editHtml: (ctx: TelegramCallbackCtx, html: string, extra?: Record<string, unknown>) => Promise<unknown>;

  // High-level bot helpers
  sendConfigMessage: (ctx: TelegramMessageCtx, user: any) => Promise<unknown>;
  enableSupportMode: (ctx: TelegramMessageCtx, telegramId: string) => Promise<unknown>;
  showMainMenu: (ctx: TelegramMessageCtx, user: any) => Promise<unknown>;
  buildMainMenuKeyboard: (user: any) => Promise<any>;

  // UI formatting helpers
  esc: (s: unknown) => string;
  fmtDate: (d: Date) => string;
  maskServerHost: (host: string) => string;
  planBtnLabel: (plan: any) => string;

  // Trial helpers
  getTrialDaysForUser: (userId: string) => Promise<number>;
  getTrialDaysFromPlans: (plans: any[]) => number;
};

