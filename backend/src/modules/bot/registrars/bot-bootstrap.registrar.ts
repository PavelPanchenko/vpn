import type { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TelegramRegistrarDeps } from './telegram-registrar.deps';
import { BotMessages } from '../messages/common.messages';
import type { TelegramBot } from '../telegram-runtime.types';

export function registerBotCatch(args: { bot: TelegramBot; logger: Logger }) {
  args.bot.catch((err: unknown, ctx) => {
    args.logger.error('Bot error:', err);
    ctx.reply(BotMessages.errorTryLaterText);
  });
}

export async function registerBotCommandsMenu(args: {
  bot: TelegramBot;
  prisma: PrismaService;
  logger: Logger;
}) {
  try {
    const activeBot = await args.prisma.botConfig.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      select: { useMiniApp: true },
    });
    const useMiniApp = Boolean(activeBot?.useMiniApp);

    // Строгий mini-app режим: оставляем только базовые команды, остальное — внутри mini app
    const commands = useMiniApp
      ? [
          { command: 'start', description: '🏠 Главное меню' },
          { command: 'info', description: 'ℹ️ Информация и документы' },
          { command: 'help', description: '❓ Помощь и инструкции' },
          { command: 'support', description: '💬 Поддержка' },
          { command: 'cancel', description: '❌ Отменить режим поддержки' },
        ]
      : [
          { command: 'start', description: '🏠 Главное меню' },
          { command: 'config', description: '📥 Получить конфигурацию VPN' },
          { command: 'pay', description: '💳 Оплатить подписку' },
          { command: 'status', description: '📊 Статус подписки' },
          { command: 'info', description: 'ℹ️ Информация и документы' },
          { command: 'support', description: '💬 Поддержка' },
          { command: 'help', description: '❓ Помощь и инструкции' },
          { command: 'cancel', description: '❌ Отменить режим поддержки' },
        ];

    await args.bot.telegram.setMyCommands(commands);
    args.logger.log('Bot commands registered successfully');
  } catch (error: unknown) {
    args.logger.warn('Failed to register bot commands:', error);
    // Продолжаем запуск даже если не удалось зарегистрировать команды
  }
}

export function registerGracefulStop(args: {
  onStop: () => void | Promise<void>;
}) {
  // Graceful stop
  process.once('SIGINT', () => void args.onStop());
  process.once('SIGTERM', () => void args.onStop());
}

export async function maybeDeleteWebhookOnStart(args: {
  bot: TelegramBot;
  config: ConfigService;
  logger: Logger;
}) {
  // Даже если вы не используете webhook сейчас, токен мог ранее использоваться в webhook-режиме.
  // getUpdates (long polling) конфликтует с активным webhook, поэтому удаляем best-effort.
  const flag = args.config.get<string>('TELEGRAM_DELETE_WEBHOOK_ON_START');
  const enabled = flag == null ? true : !['0', 'false', 'no', 'off'].includes(String(flag).toLowerCase());
  if (!enabled) return;

  try {
    await args.bot.telegram.deleteWebhook({ drop_pending_updates: true });
  } catch (error: unknown) {
    args.logger.warn('Failed to delete webhook (can be ignored):', error);
  }
}

export async function launchBot(args: { bot: TelegramBot; token: string; logger: Logger }) {
  await args.bot.launch();
  try {
    const res = await fetch(`https://api.telegram.org/bot${args.token}/getMe`);
    const json = (await res.json()) as { ok?: boolean; result?: { username?: string } };
    if (json?.ok && json?.result?.username) {
      args.logger.log(`Telegram bot started: @${json.result.username}`);
    } else {
      args.logger.log('Telegram bot started successfully');
    }
  } catch {
    args.logger.log('Telegram bot started successfully');
  }
}

export async function bootstrapLongPollingBot(args: {
  deps: TelegramRegistrarDeps;
  token: string;
  onStop: () => void | Promise<void>;
}) {
  registerBotCatch({ bot: args.deps.bot, logger: args.deps.logger });
  await registerBotCommandsMenu({ bot: args.deps.bot, prisma: args.deps.prisma, logger: args.deps.logger });
  await maybeDeleteWebhookOnStart({ bot: args.deps.bot, config: args.deps.config, logger: args.deps.logger });
  await launchBot({ bot: args.deps.bot, token: args.token, logger: args.deps.logger });
  registerGracefulStop({ onStop: args.onStop });
}

