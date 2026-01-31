import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BotService } from './bot.service';
import { UsersService } from '../users/users.service';
import { PlansService } from '../plans/plans.service';
import { PaymentsService } from '../payments/payments.service';
import { SupportService } from '../support/support.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildMainMenuKeyboard } from './keyboards/main-menu.keyboard';
import { escHtml, fmtDateRu, maskServerHost, planBtnLabel } from './telegram-ui.utils';
import { sendConfigMessage } from './messages/config.message';
import { getTrialDaysForUser, getTrialDaysFromPlans } from './trial/trial.utils';
import { editHtml, replyHtml } from './telegram-reply.utils';
import { registerTelegramCommands } from './registrars/telegram-commands.registrar';
import { registerMainMenuHandlers } from './registrars/main-menu.registrar';
import { registerOnboardingHandlers } from './registrars/onboarding.registrar';
import { registerPaymentsHandlers } from './registrars/payments.registrar';
import { registerTelegramStarsPayments } from './registrars/stars-payments.registrar';
import type { TelegramRegistrarDeps } from './registrars/telegram-registrar.deps';
import type { TelegramBot } from './telegram-runtime.types';
import type { TelegramCallbackCtx, TelegramMessageCtx } from './telegram-runtime.types';
import {
  bootstrapLongPollingBot,
} from './registrars/bot-bootstrap.registrar';
import type { PlanLike } from './bot-domain.types';
import type { TelegramReplyOptions } from './telegram-runtime.types';
import type { UserForConfigMessage } from './bot-user.types';

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot: TelegramBot | null = null;
  private isRunning = false;
  private tokenInUse: string | null = null;
  private pollingLockAcquired = false;
  // Глобальный lock на весь кластер приложений, использующих одну и ту же БД
  // (защита от 409, если запущено несколько backend-инстансов).
  private readonly pollingLockKey = 987654321;
  // Храним пользователей, которые находятся в режиме поддержки
  private supportModeUsers = new Map<string, boolean>();
  // Флаг для предотвращения одновременных запусков
  private isStarting = false;

  constructor(
    @Inject(forwardRef(() => BotService))
    private readonly botService: BotService,
    private readonly usersService: UsersService,
    private readonly plansService: PlansService,
    private readonly paymentsService: PaymentsService,
    private readonly supportService: SupportService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    // Останавливаем бота, если он уже запущен (на случай hot reload)
    if (this.bot && this.isRunning) {
      this.logger.log('Stopping existing bot instance before restart...');
      try {
        await this.stopBot();
        // Даем время на остановку
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error: unknown) {
        this.logger.warn('Error stopping existing bot:', error);
      }
    }

    // Запускаем бота асинхронно, чтобы не блокировать запуск приложения
    // Если токен не настроен или есть ошибка, приложение все равно запустится
    this.startBot().catch((err) => {
      this.logger.error('Failed to start bot on module init:', err);
    });
  }

  async onModuleDestroy() {
    await this.stopBot();
  }

  async startBot() {
    // Если уже идет процесс запуска, не запускаем повторно
    if (this.isStarting) {
      this.logger.debug('Bot is already starting, skipping duplicate start');
      return;
    }

    // Если бот уже запущен, не запускаем повторно
    if (this.isRunning && this.bot) {
      this.logger.debug('Bot is already running, skipping start');
      return;
    }

    this.isStarting = true;

    // Если бот существует, но не запущен, останавливаем его перед созданием нового
    if (this.bot && !this.isRunning) {
      this.logger.log('Stopping existing bot instance before creating new one...');
      try {
        await this.stopBot();
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error: unknown) {
        this.logger.warn('Error stopping existing bot:', error);
      }
    }

    try {
      const token = await this.botService.getToken();
      if (!token) {
        this.logger.warn('Bot token not configured. Bot will not start.');
        return;
      }

      // Гарантируем, что polling (getUpdates) стартует только в одном backend-инстансе на одну БД.
      // Если другой инстанс держит lock — просто пропускаем запуск бота, чтобы не получать 409.
      try {
        const res = await this.prisma.$queryRaw<{ got: boolean }[]>`
          SELECT pg_try_advisory_lock(${this.pollingLockKey}) AS got
        `;
        const got = Boolean(res?.[0]?.got);
        if (!got) {
          this.logger.warn(
            'Another backend instance holds Telegram polling lock. Skipping bot launch to avoid 409.',
          );
          return;
        }
        this.pollingLockAcquired = true;
      } catch (lockError: unknown) {
        // Если lock не смогли взять (например, права/ошибка соединения) — лучше не стартовать бот,
        // иначе можем поймать 409 и начать "драться" с другим инстансом.
        this.logger.error('Failed to acquire Telegram polling lock. Bot will not start.', lockError);
        return;
      }

      // Импорт telegraf
      const { Telegraf } = await import('telegraf');
      
      // Если токен изменился — обязательно пересоздаем Telegraf,
      // иначе он продолжит работать со старым токеном. Lock не отпускаем — тот же слот под новый бот.
      if (this.bot && this.tokenInUse !== token) {
        this.logger.log('Bot token changed. Recreating bot instance...');
        await this.stopBot(false);
      }

      // Создаем новый экземпляр бота, если его нет (или он был остановлен)
      if (!this.bot) {
        // Не тащим telegraf типы в доменную часть — используем наш минимальный контракт TelegramBot
        this.bot = new Telegraf(token) as unknown as TelegramBot;
        this.tokenInUse = token;
        // При пересоздании бота очищаем локальные runtime-состояния
        this.supportModeUsers.clear();
      }

      // Обработка команды /cancel - выход из режима поддержки
      this.bot.command('cancel', async (ctx: TelegramMessageCtx) => {
        const telegramId = ctx.from.id.toString();
        this.supportModeUsers.delete(telegramId);
        await this.replyHtml(
          ctx,
          `✅ <b>Режим поддержки выключен</b>\n\n` +
            `Вернуться в меню: <code>/start</code>`,
        );
      });

      const registrarDeps: TelegramRegistrarDeps = {
        bot: this.bot,
        botToken: token,
        logger: this.logger,
        config: this.config,
        prisma: this.prisma,
        usersService: this.usersService,
        plansService: this.plansService,
        paymentsService: this.paymentsService,
        supportService: this.supportService,
        supportModeUsers: this.supportModeUsers,
        replyHtml: (ctx, html, extra) => this.replyHtml(ctx, html, extra),
        editHtml: (ctx, html, extra) => this.editHtml(ctx, html, extra),
        sendConfigMessage: (ctx, user) => this.sendConfigMessage(ctx, user),
        enableSupportMode: (ctx, telegramId) => this.enableSupportMode(ctx, telegramId),
        showMainMenu: (ctx, user) => this.showMainMenu(ctx, user),
        buildMainMenuKeyboard: (user) => this.buildMainMenuKeyboard(user),
        esc: (s) => this.esc(s),
        fmtDate: (d) => this.fmtDate(d),
        maskServerHost: (host) => this.maskServerHost(host),
        planBtnLabel: (plan) => this.planBtnLabel(plan),
        getTrialDaysForUser: (userId) => this.getTrialDaysForUser(userId),
        getTrialDaysFromPlans: (plans) => this.getTrialDaysFromPlans(plans),
      };

      registerOnboardingHandlers(registrarDeps);

      registerPaymentsHandlers(registrarDeps);

      // Регистрация "утилитарных" команд и меню-хендлеров выносится в registrars для читаемости.
      registerTelegramCommands(registrarDeps);

      registerMainMenuHandlers(registrarDeps);

      // Telegram Stars payments (pre_checkout_query + successful_payment)
      registerTelegramStarsPayments(registrarDeps);

      // Запуск bота (bootstrap: catch, commands menu, optional deleteWebhook, launch, graceful stop)
      await bootstrapLongPollingBot({ deps: registrarDeps, token, onStop: () => this.stopBot() });
      this.isRunning = true;
    } catch (error: unknown) {
      this.logger.error('Failed to start bot:', error);
      // Если старт не удался — отпускаем lock, чтобы другой инстанс мог попытаться поднять бота.
      if (this.pollingLockAcquired) {
        try {
          await this.prisma.$queryRaw<{ unlocked: boolean }[]>`
            SELECT pg_advisory_unlock(${this.pollingLockKey}) AS unlocked
          `;
        } catch {
          // ignore
        }
        this.pollingLockAcquired = false;
      }
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Маскирует IP адрес сервера для безопасности
   */
  private maskServerHost(host: string): string {
    return maskServerHost(host);
  }

  // --- UI helpers (DRY) ---
  private esc(s: unknown): string {
    return escHtml(s);
  }

  private fmtDate(d: Date): string {
    return fmtDateRu(d);
  }

  // --- Trial helpers (DRY) ---
  private getTrialDaysFromPlans(plans: PlanLike[]): number {
    return getTrialDaysFromPlans(plans);
  }

  private async getTrialDaysForUser(userId: string): Promise<number> {
    return getTrialDaysForUser(userId, this.plansService);
  }

  private async replyHtml(ctx: TelegramMessageCtx, html: string, extra?: Record<string, unknown>) {
    return replyHtml(ctx, html, extra);
  }

  private async editHtml(ctx: TelegramCallbackCtx, html: string, extra?: Record<string, unknown>) {
    return editHtml(ctx, html, extra);
  }

  private planBtnLabel(plan: PlanLike): string {
    return planBtnLabel(plan);
  }

  private async sendConfigMessage(ctx: TelegramMessageCtx, user: UserForConfigMessage) {
    return sendConfigMessage({
      ctx,
      user,
      usersService: this.usersService,
      logger: this.logger,
      replyHtml: (c, html, extra) => this.replyHtml(c, html, extra),
      esc: (s) => this.esc(s),
    });
  }

  private async enableSupportMode(ctx: TelegramMessageCtx, telegramId: string) {
    this.supportModeUsers.set(telegramId, true);
    await this.replyHtml(
      ctx,
      `💬 <b>Поддержка</b>\n\n` +
        `Напишите ваш вопрос одним сообщением — мы ответим как можно скорее.\n\n` +
        `Выйти из режима: <code>/cancel</code> или <code>/start</code>`,
    );
  }

  private async buildMainMenuKeyboard(user: { id?: string } | null): Promise<TelegramReplyOptions> {
    return buildMainMenuKeyboard({ prisma: this.prisma, config: this.config, user });
  }

  private async showMainMenu(ctx: TelegramMessageCtx, user: { id: string } & Record<string, unknown>) {
    await this.replyHtml(
      ctx,
      `🏠 <b>Главное меню</b>\n<i>Выберите действие ниже</i>`,
      await this.buildMainMenuKeyboard(user),
    );
  }

  /**
   * Отправляет ответ администратора пользователю через Telegram
   */
  async sendSupportReply(telegramId: string | null, message: string): Promise<void> {
    this.logger.log(`sendSupportReply called: telegramId=${telegramId}, bot=${!!this.bot}, isRunning=${this.isRunning}`);
    
    if (!telegramId || telegramId.trim() === '') {
      this.logger.warn('Cannot send support reply: telegramId is missing or empty');
      return;
    }

    if (!this.bot) {
      this.logger.warn('Cannot send support reply: bot instance is not initialized');
      return;
    }

    // Пытаемся отправить сообщение даже если isRunning=false
    // bot.telegram API может работать, даже если бот не запущен через launch()
    try {
      this.logger.log(`Sending support reply to ${telegramId}`);
      await this.bot.telegram.sendMessage(
        telegramId,
        `💬 <b>Ответ поддержки</b>\n\n${this.esc(message)}`,
        { parse_mode: 'HTML', disable_web_page_preview: true },
      );
      this.logger.log(`Support reply sent successfully to ${telegramId}`);
    } catch (error: unknown) {
      this.logger.error(`Failed to send support reply to ${telegramId}:`, error);
      // Не пробрасываем ошибку дальше, чтобы не прерывать создание ответа в БД
    }
  }

  /**
   * Останавливает бота и опционально отпускает advisory lock.
   * @param releaseLock — при false lock не отпускаем (смена токена в том же инстансе).
   */
  async stopBot(releaseLock = true) {
    if (!this.bot) {
      this.isRunning = false;
      if (releaseLock && this.pollingLockAcquired) {
        try {
          await this.prisma.$queryRaw<{ unlocked: boolean }[]>`
            SELECT pg_advisory_unlock(${this.pollingLockKey}) AS unlocked
          `;
        } catch {
          // ignore
        }
        this.pollingLockAcquired = false;
      }
      return;
    }

    try {
      if (this.isRunning) {
        await this.bot.stop();
      }
      this.isRunning = false;
      this.bot = null;
      this.tokenInUse = null;
      if (releaseLock && this.pollingLockAcquired) {
        try {
          await this.prisma.$queryRaw<{ unlocked: boolean }[]>`
            SELECT pg_advisory_unlock(${this.pollingLockKey}) AS unlocked
          `;
        } catch {
          // ignore
        }
        this.pollingLockAcquired = false;
      }
      this.logger.log('Telegram bot stopped');
    } catch (error: unknown) {
      this.logger.error('Error stopping bot:', error);
      this.isRunning = false;
      this.bot = null;
      this.tokenInUse = null;
      if (releaseLock && this.pollingLockAcquired) {
        try {
          await this.prisma.$queryRaw<{ unlocked: boolean }[]>`
            SELECT pg_advisory_unlock(${this.pollingLockKey}) AS unlocked
          `;
        } catch {
          // ignore
        }
        this.pollingLockAcquired = false;
      }
    }
  }

  async restartBot() {
    // Если бот ещё запускается — ждём завершения, иначе рестарт «проглатывается» и старый бот остаётся.
    if (this.isStarting) {
      this.logger.log('Restart requested while bot is starting, waiting for startup to finish...');
      const deadline = Date.now() + 15000; // не более 15 с
      while (this.isStarting && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 300));
      }
      if (this.isStarting) {
        this.logger.warn('Startup did not finish in time, forcing restart');
      }
    }

    this.logger.log('Restarting bot...');
    await this.stopBot();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await this.startBot();
  }
}
