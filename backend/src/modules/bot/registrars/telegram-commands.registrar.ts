import { buildHelpMessageHtml } from '../messages/help.message';
import { buildInfoMessageHtml } from '../messages/info.message';
import { buildStatusHtmlMessage } from '../messages/status.message';
import type { TelegramRegistrarDeps } from './telegram-registrar.deps';
import { BotMessages } from '../messages/common.messages';
import { CONFIG_CHOICE_HTML } from '../messages/config.message';
import { getMarkup } from '../telegram-markup.utils';
import type { TelegramMessageCtx } from '../telegram-runtime.types';

export function registerTelegramCommands(args: TelegramRegistrarDeps) {
  // /config — тот же выбор «QR / Ссылка», что и при нажатии «Получить конфиг»
  args.bot.command('config', async (ctx: TelegramMessageCtx) => {
    args.logger.log('Command /config received');
    const telegramId = ctx.from.id.toString();

    try {
      const user = await args.usersService.findByTelegramId(telegramId);
      if (!user) {
        await args.replyHtml(ctx, BotMessages.userNotFoundStartHtml);
        return;
      }
      const Markup = await getMarkup();
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📱 QR-код', 'config_show_qr'), Markup.button.callback('🔗 Ссылка', 'config_show_link')],
        [Markup.button.callback('🏠 В меню', 'back_to_main')],
      ]);
      await args.replyHtml(ctx, CONFIG_CHOICE_HTML, keyboard);
    } catch (error: unknown) {
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
    } catch (error: unknown) {
      args.logger.error('Error handling /support command:', error);
      await ctx.reply(BotMessages.errorTryLaterText);
    }
  });

  // /help — тот же контент, что и по кнопке «Помощь» (по кнопке редактируется одно сообщение)
  args.bot.command('help', async (ctx: TelegramMessageCtx) => {
    try {
      await args.replyHtml(ctx, buildHelpMessageHtml());
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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

  // /info — тот же контент, что и по кнопке «Информация» (по кнопке редактируется одно сообщение)
  args.bot.command('info', async (ctx: TelegramMessageCtx) => {
    try {
      await args.replyHtml(ctx, buildInfoMessageHtml(args.config));
    } catch (error: unknown) {
      args.logger.error('Error handling /info command:', error);
      await ctx.reply(BotMessages.infoLoadFailedText);
    }
  });
}

