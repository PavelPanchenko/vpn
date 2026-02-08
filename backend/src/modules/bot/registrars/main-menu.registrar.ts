import { SupportMessageType } from '@prisma/client';
import { buildStatusMenuSnippet } from '../messages/status.message';
import { scheduleDeleteMessage, scheduleDeleteMessageFromReply } from '../delete-after.utils';
import type { TelegramRegistrarDeps } from './telegram-registrar.deps';
import { getPaidPlansWithFallback } from '../plans/paid-plans.utils';
import { getMarkup } from '../telegram-markup.utils';
import { bm } from '../messages/common.messages';
import { configChoiceHtml } from '../messages/config.message';
import { ui } from '../messages/ui.messages';
import { editOrReplyHtml } from '../telegram-reply.utils';
import { cbThenReplyHtml, cbThenReplyText } from '../telegram-callback.utils';
import type { TelegramCallbackCtx, TelegramMessageCtx } from '../telegram-runtime.types';
import { formatPlanGroupButtonLabel, groupPlansByNameAndPeriod } from '../plans/plan-grouping.utils';
import { botLangFromCtx, extractTelegramLanguageCode } from '../i18n/bot-lang';

export function registerMainMenuHandlers(args: TelegramRegistrarDeps) {
  args.bot.action('get_config', async (ctx: TelegramCallbackCtx) => {
    const telegramId = ctx.from.id.toString();
    const lang = botLangFromCtx(ctx);
    void args.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, extractTelegramLanguageCode(ctx));
    const user = await args.usersService.findByTelegramId(telegramId);

    if (!user) {
      await ctx.answerCbQuery(bm(lang).userNotFoundCbText);
      return;
    }
    await ctx.answerCbQuery();
    const Markup = await getMarkup();
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(ui(lang).qrBtn, 'config_show_qr'), Markup.button.callback(ui(lang).linkBtn, 'config_show_link')],
      [Markup.button.callback(ui(lang).backToMenuBtn, 'back_to_main')],
    ]);
    await args.editHtml(ctx, configChoiceHtml(lang), keyboard);
  });

  args.bot.action('config_show_link', async (ctx: TelegramCallbackCtx) => {
    const telegramId = ctx.from.id.toString();
    const lang = botLangFromCtx(ctx);
    void args.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, extractTelegramLanguageCode(ctx));
    const user = await args.usersService.findByTelegramId(telegramId);
    if (!user) {
      await ctx.answerCbQuery(bm(lang).userNotFoundCbText);
      return;
    }
    await ctx.answerCbQuery();
    const data = await args.getConfigData(user, lang);
    const Markup = await getMarkup();
    if (!data.ok) {
      const keyboard = Markup.inlineKeyboard([[Markup.button.callback(ui(lang).backToMenuBtn, 'back_to_main')]]);
      await args.editHtml(ctx, data.htmlMessage, keyboard);
      return;
    }
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback(ui(lang).backToMenuBtn, 'back_to_main')]]);
    await args.editHtml(ctx, args.configLinkHtml(data.url, data.serverName, lang), keyboard);
  });

  args.bot.action('config_show_qr', async (ctx: TelegramCallbackCtx) => {
    const telegramId = ctx.from.id.toString();
    const lang = botLangFromCtx(ctx);
    void args.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, extractTelegramLanguageCode(ctx));
    const user = await args.usersService.findByTelegramId(telegramId);
    if (!user) {
      await ctx.answerCbQuery(bm(lang).userNotFoundCbText);
      return;
    }
    await ctx.answerCbQuery();
    const data = await args.getConfigData(user, lang);
    const Markup = await getMarkup();
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback(ui(lang).backToMenuBtn, 'back_to_main')]]);
    if (!data.ok) {
      await args.editHtml(ctx, data.htmlMessage, keyboard);
      return;
    }
    await args.editHtml(ctx, ui(lang).preparingQrText, keyboard);
    try {
      await args.sendConfigQrPhoto(ctx, data.url, data.serverName, lang);
    } catch {
      await args.editHtml(ctx, ui(lang).qrFailedText, keyboard);
      return;
    }
    // Удаляем текстовое сообщение — остаётся только QR с кнопкой «В меню»
    try {
      const chatId = ctx.chat?.id ?? ctx.from.id;
      const msgId = (ctx as any).callbackQuery?.message?.message_id;
      if (chatId && msgId) {
        await args.bot.telegram.deleteMessage(chatId, msgId);
      }
    } catch {
      // fallback: если удалить не получилось — редактируем в меню
      await args.showMainMenuEdit(ctx, user);
    }
  });

  args.bot.action('show_pay', async (ctx: TelegramCallbackCtx) => {
    const telegramId = ctx.from.id.toString();
    const lang = botLangFromCtx(ctx);
    void args.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, extractTelegramLanguageCode(ctx));

    try {
      const user = await args.usersService.findByTelegramId(telegramId);

      if (!user) {
        await ctx.answerCbQuery(bm(lang).userNotFoundCbText);
        return;
      }

      const { plans: paidPlans, basePlans } = await getPaidPlansWithFallback({
        userId: user.id,
        plansService: args.plansService,
        prisma: args.prisma,
        logger: args.logger,
      });
      args.logger.debug(`Found ${basePlans.length} plans for user ${user.id}`);
      args.logger.debug(`Found ${paidPlans.length} paid plans after filtering`);

      if (paidPlans.length === 0) {
        await cbThenReplyHtml({
          ctx,
          cbText: bm(lang).noPaidPlansCbText,
          html: bm(lang).noPaidPlansHtml,
          replyHtml: args.replyHtml,
        });
        return;
      }

      const Markup = await getMarkup();
      const groups = groupPlansByNameAndPeriod(paidPlans);
      const providersAllowed = await args.paymentIntentsService.getAvailableProvidersForTelegramLanguageCode({
        telegramLanguageCode: user.telegramLanguageCode ?? null,
      });
      const buttons = groups.map((g) => [
        Markup.button.callback(
          formatPlanGroupButtonLabel(g, {
            showPlatega: providersAllowed.PLATEGA,
            showCryptoCloud: providersAllowed.CRYPTOCLOUD,
            showStars: providersAllowed.TELEGRAM_STARS,
            cryptoTelegramLanguageCode: user.telegramLanguageCode ?? null,
          }),
          `select_plan_${g.representative.id}`,
        ),
      ]);
      buttons.push([Markup.button.callback(ui(lang).backToMenuBtn, 'back_to_main')]);

      await ctx.answerCbQuery();

      const sent = await editOrReplyHtml(
        ctx,
        lang === 'en'
          ? `💳 <b>Payment</b>\n\n` +
              `1) Choose a plan\n` +
              `2) Choose a payment method\n\n` +
              `After payment the subscription activates automatically.`
          : `💳 <b>Оплата</b>\n\n` +
              `1) Выберите тариф\n` +
              `2) Выберите способ оплаты\n\n` +
              `После оплаты подписка активируется автоматически.`,
        Markup.inlineKeyboard(buttons),
      );
      scheduleDeleteMessageFromReply(args.bot.telegram, sent, ctx);
    } catch (error: unknown) {
      args.logger.error('Error handling show_pay action:', error);
      const lang = botLangFromCtx(ctx);
      await cbThenReplyText({ ctx, cbText: bm(lang).errorCbText, replyText: bm(lang).errorTryLaterText });
    }
  });

  // Кнопка «В меню» на QR-фото: удаляем QR и показываем главное меню
  args.bot.action('dismiss_qr', async (ctx: TelegramCallbackCtx) => {
    const telegramId = ctx.from.id.toString();
    try {
      await ctx.answerCbQuery();
      // Удаляем QR-сообщение
      const chatId = ctx.chat?.id ?? ctx.from.id;
      const msgId = (ctx as any).callbackQuery?.message?.message_id;
      if (chatId && msgId) {
        await args.bot.telegram.deleteMessage(chatId, msgId).catch(() => {});
      }
      // Показываем главное меню новым сообщением
      const user = await args.usersService.findByTelegramId(telegramId, { userServers: true });
      if (user) {
        await args.showMainMenu(ctx, user);
      }
    } catch {
      // ignore
    }
  });

  // Обработка кнопки "Назад в меню"
  args.bot.action('back_to_main', async (ctx: TelegramCallbackCtx) => {
    const telegramId = ctx.from.id.toString();
    const lang = botLangFromCtx(ctx);
    void args.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, extractTelegramLanguageCode(ctx));

    try {
      const user = await args.usersService.findByTelegramId(telegramId, { userServers: true });

      if (!user) {
        await ctx.answerCbQuery(bm(lang).userNotFoundCbText);
        return;
      }

      await ctx.answerCbQuery();

      // Редактируем текущее сообщение — без нового, чат не засоряется
      await args.showMainMenuEdit(ctx, user);
    } catch (error: unknown) {
      args.logger.error('Error handling back_to_main action:', error);
      await ctx.answerCbQuery(bm(lang).errorCbText);
    }
  });

  args.bot.action('show_status', async (ctx: TelegramCallbackCtx) => {
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
        userServers: { where: { isActive: true }, include: { server: true } },
      });

      if (!user) {
        await ctx.answerCbQuery(bm(lang).userNotFoundCbText);
        return;
      }

      const statusText = buildStatusMenuSnippet({ lang, user, fmtDate: (d) => args.fmtDate(lang, d) });
      const menuKeyboard = await args.buildMainMenuKeyboard(user, lang);

      await ctx.answerCbQuery();

      try {
        await ctx.editMessageText(`${lang === 'en' ? '🏠 Menu' : '🏠 Главное меню'}:${statusText}`, menuKeyboard);
      } catch {
        // Не отправляем новое сообщение — иначе получится дубликат. Редактирование может не пройти,
        // если текст не изменился (message is not modified) или сообщение устарело.
      }
    } catch (error: unknown) {
      args.logger.error('Error handling show_status action:', error);
      await ctx.answerCbQuery(bm(lang).errorCbText);
    }
  });

  // Обработка кнопки "Поддержка"
  args.bot.action('start_support', async (ctx: TelegramCallbackCtx) => {
    const telegramId = ctx.from.id.toString();
    const lang = botLangFromCtx(ctx);
    void args.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, extractTelegramLanguageCode(ctx));

    try {
      const user = await args.usersService.findByTelegramId(telegramId);

      if (!user) {
        await ctx.answerCbQuery(bm(lang).userNotFoundCbText);
        return;
      }

      await ctx.answerCbQuery();
      await args.enableSupportMode(ctx, telegramId);
    } catch (error: unknown) {
      args.logger.error('Error starting support mode:', error);
      await ctx.answerCbQuery(bm(lang).errorCbText);
    }
  });

  // Обработка текстовых сообщений от пользователей (для поддержки)
  args.bot.on('text', async (ctx: TelegramMessageCtx & { message: { text?: string } }) => {
    // Пропускаем команды
    if (ctx.message.text?.startsWith('/')) return;

    const telegramId = ctx.from.id.toString();
    const lang = botLangFromCtx(ctx);
    void args.usersService.updateTelegramLanguageCodeByTelegramId(telegramId, extractTelegramLanguageCode(ctx));

    // Проверяем, находится ли пользователь в режиме поддержки
    if (!args.supportModeUsers.get(telegramId)) return;

    const messageText = ctx.message.text;
    if (!messageText || messageText.trim().length === 0) return;

    try {
      const user = await args.usersService.findByTelegramId(telegramId);

      if (!user) {
        await ctx.reply(bm(lang).userNotFoundUseStartText);
        args.supportModeUsers.delete(telegramId);
        return;
      }

      // Сохраняем сообщение в поддержку
      await args.supportService.create({
        vpnUserId: user.id,
        type: SupportMessageType.USER_MESSAGE,
        message: messageText,
      });

      await args.replyHtml(
        ctx,
        bm(lang).supportMessageSentHtml,
      );
    } catch (error: unknown) {
      args.logger.error('Error handling user message:', error);
      await ctx.reply(bm(lang).supportSendFailedText);
    }
  });
}

