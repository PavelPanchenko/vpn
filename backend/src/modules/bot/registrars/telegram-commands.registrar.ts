import { scheduleDeleteMessage, scheduleDeleteMessageFromReply } from '../delete-after.utils';
import { buildHelpMessageHtml } from '../messages/help.message';
import { buildInfoMessageHtml } from '../messages/info.message';
import { buildStatusHtmlMessage } from '../messages/status.message';
import type { TelegramRegistrarDeps } from './telegram-registrar.deps';
import { bm } from '../messages/common.messages';
import { configChoiceHtml } from '../messages/config.message';
import { ui } from '../messages/ui.messages';
import { getMarkup } from '../telegram-markup.utils';
import type { TelegramMessageCtx } from '../telegram-runtime.types';
import { botLangFromCtx, extractTelegramLanguageCode } from '../i18n/bot-lang';

export function registerTelegramCommands(args: TelegramRegistrarDeps) {
  // /config — тот же выбор «QR / Ссылка», что и при нажатии «Получить конфиг»
  args.bot.command('config', async (ctx: TelegramMessageCtx) => {
    args.logger.log('Command /config received');
    const telegramId = ctx.from.id.toString();
    const lang = botLangFromCtx(ctx);
    void args.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, extractTelegramLanguageCode(ctx));

    try {
      const user = await args.usersService.findByTelegramId(telegramId);
      if (!user) {
        await args.replyHtml(ctx, bm(lang).userNotFoundStartHtml);
        return;
      }
      const Markup = await getMarkup();
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(ui(lang).qrBtn, 'config_show_qr'), Markup.button.callback(ui(lang).linkBtn, 'config_show_link')],
        [Markup.button.callback(ui(lang).backToMenuBtn, 'back_to_main')],
      ]);
      const sent = await args.replyHtml(ctx, configChoiceHtml(lang), keyboard);
      scheduleDeleteMessageFromReply(args.bot.telegram, sent);
    } catch (error: unknown) {
      args.logger.error('Error handling /config command:', error);
      await args.replyHtml(
        ctx,
        lang === 'en'
          ? `❌ <b>Failed to get config</b>\n\nTry again later or contact support: <code>/support</code>`
          : `❌ <b>Не удалось получить конфиг</b>\n\n` +
              `Попробуйте позже или напишите в поддержку: <code>/support</code>`,
      );
    }
  });

  // /support
  args.bot.command('support', async (ctx: TelegramMessageCtx) => {
    args.logger.log('Command /support received');
    const telegramId = ctx.from.id.toString();
    const lang = botLangFromCtx(ctx);
    void args.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, extractTelegramLanguageCode(ctx));

    try {
      const user = await args.usersService.findByTelegramId(telegramId);

      if (!user) {
        args.logger.warn(`User not found for telegramId: ${telegramId}`);
        await args.replyHtml(ctx, bm(lang).userNotFoundStartHtml);
        return;
      }

      args.logger.log(`Support mode activated for user: ${telegramId}`);
      await args.enableSupportMode(ctx, telegramId);
    } catch (error: unknown) {
      args.logger.error('Error handling /support command:', error);
      await ctx.reply(bm(lang).errorTryLaterText);
    }
  });

  // /help — тот же контент, что и по кнопке «Помощь» (по кнопке редактируется одно сообщение)
  args.bot.command('help', async (ctx: TelegramMessageCtx) => {
    const lang = botLangFromCtx(ctx);
    void args.usersService.updateTelegramLanguageCodeByTelegramId(ctx.from.id.toString(), extractTelegramLanguageCode(ctx));
    if (ctx.chat?.id != null && ctx.message?.message_id != null) {
      scheduleDeleteMessage(args.bot.telegram, ctx.chat.id, ctx.message.message_id);
    }
    try {
      const sent = await args.replyHtml(ctx, buildHelpMessageHtml(lang));
      scheduleDeleteMessageFromReply(args.bot.telegram, sent);
    } catch (error: unknown) {
      args.logger.error('Error handling /help command:', error);
      await ctx.reply(bm(lang).errorTryLaterText);
    }
  });

  // /status
  args.bot.command('status', async (ctx: TelegramMessageCtx) => {
    args.logger.log('Command /status received');
    const telegramId = ctx.from.id.toString();
    const lang = botLangFromCtx(ctx);
    void args.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, extractTelegramLanguageCode(ctx));

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
        await ctx.reply(bm(lang).userNotFoundUseStartText);
        return;
      }

      const sent = await args.replyHtml(
        ctx,
        buildStatusHtmlMessage({ lang, user, esc: args.esc, fmtDate: (d) => args.fmtDate(lang, d) }),
      );
      scheduleDeleteMessageFromReply(args.bot.telegram, sent);
    } catch (error: unknown) {
      args.logger.error('Error handling /status command:', error);
      await ctx.reply(
        lang === 'en'
          ? '❌ Failed to get status.\n\n' +
              'Possible reasons:\n' +
              '• Database connectivity issues\n' +
              '• Temporary service outage\n\n' +
              'Try again later or contact support via /support.'
          : '❌ Произошла ошибка при получении статуса.\n\n' +
              'Возможные причины:\n' +
              '• Проблемы с подключением к базе данных\n' +
              '• Временная недоступность сервиса\n\n' +
              'Попробуйте позже или обратитесь в поддержку через /support.',
      );
    }
  });

  // /info — тот же контент, что и по кнопке «Информация» (по кнопке редактируется одно сообщение)
  args.bot.command('info', async (ctx: TelegramMessageCtx) => {
    const lang = botLangFromCtx(ctx);
    void args.usersService.updateTelegramLanguageCodeByTelegramId(ctx.from.id.toString(), extractTelegramLanguageCode(ctx));
    if (ctx.chat?.id != null && ctx.message?.message_id != null) {
      scheduleDeleteMessage(args.bot.telegram, ctx.chat.id, ctx.message.message_id);
    }
    try {
      const sent = await args.replyHtml(ctx, buildInfoMessageHtml(lang, args.config));
      scheduleDeleteMessageFromReply(args.bot.telegram, sent);
    } catch (error: unknown) {
      args.logger.error('Error handling /info command:', error);
      await ctx.reply(bm(lang).infoLoadFailedText);
    }
  });
}

