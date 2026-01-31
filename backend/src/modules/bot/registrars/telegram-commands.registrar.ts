import { buildStatusHtmlMessage } from '../messages/status.message';
import type { TelegramRegistrarDeps } from './telegram-registrar.deps';
import { BotMessages } from '../messages/common.messages';
import type { TelegramMessageCtx } from '../telegram-runtime.types';

export function registerTelegramCommands(args: TelegramRegistrarDeps) {
  // /config
  args.bot.command('config', async (ctx: TelegramMessageCtx) => {
    args.logger.log('Command /config received');
    const telegramId = ctx.from.id.toString();

    try {
      const user = await args.usersService.findByTelegramId(telegramId, {
        userServers: {
          where: { isActive: true },
          include: { server: true },
        },
      });

      await args.sendConfigMessage(ctx, user);
    } catch (error: any) {
      args.logger.error('Error handling /config command:', error);
      await args.replyHtml(
        ctx,
        `❌ <b>Не удалось получить конфиг</b>\n\n` +
          `Попробуйте позже или напишите в поддержку: <code>/support</code>`,
      );
    }
  });

  // /support
  args.bot.command('support', async (ctx: TelegramMessageCtx) => {
    args.logger.log('Command /support received');
    const telegramId = ctx.from.id.toString();

    try {
      const user = await args.usersService.findByTelegramId(telegramId);

      if (!user) {
        args.logger.warn(`User not found for telegramId: ${telegramId}`);
        await args.replyHtml(ctx, BotMessages.userNotFoundStartHtml);
        return;
      }

      args.logger.log(`Support mode activated for user: ${telegramId}`);
      await args.enableSupportMode(ctx, telegramId);
    } catch (error: any) {
      args.logger.error('Error handling /support command:', error);
      await ctx.reply(BotMessages.errorTryLaterText);
    }
  });

  // /help
  args.bot.command('help', async (ctx: TelegramMessageCtx) => {
    try {
      const helpMessage =
        `❓ <b>Помощь</b>\n\n` +
        `<b>1) Подключение</b>\n` +
        `• Получите конфиг: <code>/config</code>\n` +
        `• Импортируйте в приложение и включите VPN\n\n` +
        `<b>2) Рекомендуемые приложения</b>\n` +
        `• iOS: Shadowrocket / v2rayNG\n` +
        `• Android: v2rayNG / V2rayTun\n` +
        `• Windows: v2rayN\n` +
        `• macOS: ClashX\n\n` +
        `<b>3) Команды</b>\n` +
        `• <code>/start</code> — меню\n` +
        `• <code>/config</code> — конфиг\n` +
        `• <code>/pay</code> — оплата\n` +
        `• <code>/status</code> — статус\n` +
        `• <code>/support</code> — поддержка\n\n` +
        `Если что-то не работает — напишите в <code>/support</code>.`;

      await args.replyHtml(ctx, helpMessage);
    } catch (error: any) {
      args.logger.error('Error handling /help command:', error);
      await ctx.reply(BotMessages.errorTryLaterText);
    }
  });

  // /status
  args.bot.command('status', async (ctx: TelegramMessageCtx) => {
    args.logger.log('Command /status received');
    const telegramId = ctx.from.id.toString();

    try {
      const user = await args.usersService.findByTelegramId(telegramId, {
        subscriptions: {
          where: { active: true },
          orderBy: { endsAt: 'desc' },
          take: 1,
        },
        userServers: {
          where: { isActive: true },
          include: { server: true },
        },
      });

      if (!user) {
        await ctx.reply(BotMessages.userNotFoundUseStartText);
        return;
      }

      await args.replyHtml(ctx, buildStatusHtmlMessage({ user, esc: args.esc, fmtDate: args.fmtDate }));
    } catch (error: any) {
      args.logger.error('Error handling /status command:', error);
      await ctx.reply(
        '❌ Произошла ошибка при получении статуса.\n\n' +
          'Возможные причины:\n' +
          '• Проблемы с подключением к базе данных\n' +
          '• Временная недоступность сервиса\n\n' +
          'Попробуйте позже или обратитесь в поддержку через /support.',
      );
    }
  });

  // /info
  args.bot.command('info', async (ctx: TelegramMessageCtx) => {
    try {
      const siteUrlRaw = args.config.get<string>('PUBLIC_SITE_URL') || '';
      const siteUrl = siteUrlRaw.replace(/\/+$/, '');

      const privacyUrl = siteUrl ? `${siteUrl}/privacy` : null;
      const termsUrl = siteUrl ? `${siteUrl}/terms` : null;

      const supportEmail = args.config.get<string>('PUBLIC_SUPPORT_EMAIL') || null;
      const supportTelegram = args.config.get<string>('PUBLIC_SUPPORT_TELEGRAM') || null;

      const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      let msg = 'ℹ️ <b>Информация</b>\n\n';
      msg += '• Документы:\n';
      if (privacyUrl) {
        msg += `  • <a href="${privacyUrl}">Политика конфиденциальности</a>\n`;
      } else {
        msg += '  • Политика конфиденциальности — не настроено\n';
      }
      if (termsUrl) {
        msg += `  • <a href="${termsUrl}">Пользовательское соглашение</a>\n\n`;
      } else {
        msg += '  • Пользовательское соглашение — не настроено\n\n';
      }
      msg += '• Контакты:\n';
      if (supportTelegram) {
        const tgUser = supportTelegram.replace(/^@/, '');
        msg += `  • Telegram: <a href="tg://resolve?domain=${escape(tgUser)}">${escape(supportTelegram)}</a>\n`;
      }
      if (supportEmail) {
        msg += `  • Email: <a href="mailto:${escape(supportEmail)}">${escape(supportEmail)}</a>\n`;
      }
      if (!supportTelegram && !supportEmail) msg += '  • не настроено\n';

      await ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (error: any) {
      args.logger.error('Error handling /info command:', error);
      await ctx.reply(BotMessages.infoLoadFailedText);
    }
  });
}

