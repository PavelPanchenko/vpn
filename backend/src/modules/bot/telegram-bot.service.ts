import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BotService } from './bot.service';
import { UsersService } from '../users/users.service';
import { PlansService } from '../plans/plans.service';
import { PaymentsService } from '../payments/payments.service';
import { SupportService } from '../support/support.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupportMessageType } from '@prisma/client';

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot: any = null;
  private isRunning = false;
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
      } catch (error: any) {
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
      } catch (error: any) {
        this.logger.warn('Error stopping existing bot:', error);
      }
    }

    try {
      const token = await this.botService.getToken();
      if (!token) {
        this.logger.warn('Bot token not configured. Bot will not start.');
        return;
      }

      // Импорт telegraf
      const { Telegraf, Markup } = await import('telegraf');
      
      // Создаем новый экземпляр бота только если его еще нет
      if (!this.bot) {
        this.bot = new Telegraf(token);
      }

      // Обработка команды /cancel - выход из режима поддержки
      this.bot.command('cancel', async (ctx: any) => {
        const telegramId = ctx.from.id.toString();
        this.supportModeUsers.delete(telegramId);
        await ctx.reply('✅ Режим поддержки отменен. Используйте /start для возврата в главное меню.');
      });

      // Обработка команды /start
      // ВАЖНО: Пользователи идентифицируются по telegramId, а не по botId.
      // Это означает, что при смене токена бота все существующие пользователи,
      // их подписки, платежи и серверы автоматически остаются доступными в новом боте.
      this.bot.command('start', async (ctx: any) => {
        const telegramId = ctx.from.id.toString();
        // Выходим из режима поддержки при /start
        this.supportModeUsers.delete(telegramId);
        const userName = ctx.from.first_name || ctx.from.username || 'User';

        try {
          // Создаём или получаем пользователя (без сервера и подписки)
          // Поиск по telegramId гарантирует, что пользователь будет найден
          // независимо от того, через какого бота он зарегистрировался
          let user = await this.prisma.vpnUser.findFirst({
            where: { telegramId },
            include: { userServers: true },
          });

          if (!user) {
            // Создаём нового пользователя без сервера и подписки
            const created = await this.usersService.createFromTelegram(telegramId, userName);
            // Получаем пользователя с userServers
            user = await this.prisma.vpnUser.findUnique({
              where: { id: created.id },
              include: { userServers: true },
            });
          }

          if (!user) {
            await ctx.reply('❌ Ошибка при создании пользователя. Попробуйте позже.');
            return;
          }

          // Если у пользователя уже есть сервер - показываем главное меню
          if (user.serverId || (user.userServers && user.userServers.length > 0)) {
            await this.showMainMenu(ctx, user);
            return;
          }

          // Показываем выбор локации
          const servers = await this.prisma.vpnServer.findMany({
            where: { active: true },
            orderBy: { createdAt: 'desc' },
          });

          if (servers.length === 0) {
            await ctx.reply('❌ Нет доступных серверов. Обратитесь к администратору.');
            return;
          }

          const buttons = servers.map((server: any) => [
            Markup.button.callback(server.name, `select_server_${server.id}`),
          ]);

          await ctx.reply(
            `👋 Добро пожаловать, ${userName}!\n\n` +
              `🚀 Выберите локацию для подключения:\n\n` +
              `После выбора вам будет предоставлен пробный период на 3 дня.`,
            Markup.inlineKeyboard(buttons),
          );
        } catch (error: any) {
          this.logger.error('Error handling /start command:', error);
          await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
        }
      });

      // Обработка выбора сервера - показываем информацию и тарифы
      this.bot.action(/^select_server_(.+)$/, async (ctx: any) => {
        const serverId = ctx.match[1];
        const telegramId = ctx.from.id.toString();
        const userName = ctx.from.first_name || ctx.from.username || 'User';

        try {
          // Получаем пользователя (он должен быть создан при /start)
          let user = await this.prisma.vpnUser.findFirst({
            where: { telegramId },
          });

          if (!user) {
            // Если по какой-то причине пользователя нет - создаём
            user = await this.usersService.createFromTelegram(telegramId, userName);
          }

          // Проверяем, не добавлен ли уже этот сервер
          const existingUserServer = await this.prisma.userServer.findFirst({
            where: { vpnUserId: user.id, serverId },
          });

          if (existingUserServer) {
            await ctx.answerCbQuery('Эта локация уже добавлена!');
            await this.showMainMenu(ctx, user);
            return;
          }

          // Проверяем сервер
          const server = await this.prisma.vpnServer.findUnique({
            where: { id: serverId },
          });

          if (!server || !server.active) {
            await ctx.answerCbQuery('❌ Сервер недоступен');
            return;
          }

          await ctx.answerCbQuery();

          // Получаем доступные тарифы для пользователя
          const plans = await this.plansService.list(user.id);
          const trialPlan = plans.find((p) => p.isTrial);
          let paidPlans = plans.filter((p: any) => !p.isTrial && p.active);
          
          // Если для пользователя нет тарифов, показываем все активные (fallback)
          if (paidPlans.length === 0) {
            const allActivePlans = await this.prisma.plan.findMany({
              where: { active: true, isTrial: false },
              orderBy: { price: 'asc' },
            });
            paidPlans = allActivePlans;
          }
          
          // Показываем первые 4 тарифа (чтобы не перегружать сообщение)
          const displayedPlans = paidPlans.slice(0, 4);

          // Формируем сообщение с информацией о сервере и тарифах
          const maskedHost = this.maskServerHost(server.host);
          let message = `📍 ${server.name}\n\n`;
          message += `🌐 Сервер: ${maskedHost}:${server.port}\n`;
          message += `🔒 Безопасность: ${server.security || 'NONE'}\n\n`;

          if (trialPlan) {
            message += `🎁 Пробный период:\n`;
            message += `   ${trialPlan.periodDays} дней бесплатно\n\n`;
          }

          if (displayedPlans.length > 0) {
            // Находим средний тариф (оптимальный выбор) - берем тариф из середины списка
            const middleIndex = Math.floor(displayedPlans.length / 2);
            const recommendedPlan = displayedPlans[middleIndex];
            
            // Находим минимальную цену для отображения
            const minPrice = Math.min(...displayedPlans.map((p: any) => p.price));
            const minPricePlan = displayedPlans.find((p: any) => p.price === minPrice);
            
            message += `💳 Тарифы после пробного периода:\n`;
            displayedPlans.forEach((plan: any) => {
              // Отмечаем средний тариф как рекомендуемый
              const emoji = plan.id === recommendedPlan.id ? '🔥 ' : '   ';
              message += `${emoji}${plan.name} - ${plan.price} ${plan.currency} (${plan.periodDays} дн.)\n`;
            });
            
            if (paidPlans.length > displayedPlans.length) {
              message += `   ... и еще ${paidPlans.length - displayedPlans.length} тарифов\n`;
            }
            
            message += `\n`;
            message += `💰 От ${minPrice} ${minPricePlan?.currency || 'RUB'}/мес\n\n`;
          }

          message += `После подключения вам будет предоставлен пробный период на ${trialPlan?.periodDays || 3} дня.`;

          // Кнопки: подтвердить или выбрать другую локацию
          const buttons = [
            [Markup.button.callback('✅ Подтвердить и подключить', `confirm_server_${serverId}`)],
            [Markup.button.callback('🔙 Выбрать другую локацию', 'back_to_servers')],
          ];

          await ctx.editMessageText(message, Markup.inlineKeyboard(buttons));
        } catch (error: any) {
          this.logger.error('Error handling server selection:', error);
          await ctx.answerCbQuery('❌ Ошибка при загрузке информации');
          await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
        }
      });

      // Обработка подтверждения выбора сервера
      this.bot.action(/^confirm_server_(.+)$/, async (ctx: any) => {
        const serverId = ctx.match[1];
        const telegramId = ctx.from.id.toString();
        const userName = ctx.from.first_name || ctx.from.username || 'User';

        try {
          // Получаем пользователя
          let user = await this.prisma.vpnUser.findFirst({
            where: { telegramId },
          });

          if (!user) {
            await ctx.answerCbQuery('❌ Пользователь не найден');
            return;
          }

          // Проверяем сервер
          const server = await this.prisma.vpnServer.findUnique({
            where: { id: serverId },
          });

          if (!server || !server.active) {
            await ctx.answerCbQuery('❌ Сервер недоступен');
            return;
          }

          await ctx.answerCbQuery('⏳ Подключаем локацию...');

          // Добавляем сервер и триал подписку к существующему пользователю
          user = await this.usersService.addServerAndTrial(user.id, serverId, 3);

          await ctx.editMessageText(
            `✅ Локация успешно подключена!\n\n` +
              `📍 Локация: ${server.name}\n` +
              `🎁 Пробный период: 3 дня\n\n` +
              `Используйте /config для получения конфигурации VPN.\n` +
              `Используйте /pay для продления подписки.`,
          );

          // Показываем главное меню
          await this.showMainMenu(ctx, user);
        } catch (error: any) {
          this.logger.error('Error confirming server selection:', error);
          await ctx.answerCbQuery('❌ Ошибка при подключении локации');
          await ctx.reply('❌ Произошла ошибка. Попробуйте позже или обратитесь к администратору.');
        }
      });

      // Обработка возврата к списку серверов
      this.bot.action('back_to_servers', async (ctx: any) => {
        const telegramId = ctx.from.id.toString();
        const userName = ctx.from.first_name || ctx.from.username || 'User';

        try {
          await ctx.answerCbQuery();

          // Получаем пользователя с его серверами
          const user = await this.prisma.vpnUser.findFirst({
            where: { telegramId },
            include: {
              userServers: {
                include: { server: true },
              },
            },
          });

          // Всегда показываем все доступные серверы (пользователь может переключиться на любой)
          const allServers = await this.prisma.vpnServer.findMany({
            where: { active: true },
            orderBy: { createdAt: 'desc' },
          });

          if (allServers.length === 0) {
            await ctx.editMessageText('❌ Нет доступных серверов. Обратитесь к администратору.');
            return;
          }

          const { Markup } = await import('telegraf');
          const buttons = allServers.map((server: any) => [
            Markup.button.callback(server.name, `select_server_${server.id}`),
          ]);

          // Добавляем кнопку "Назад в меню"
          buttons.push([Markup.button.callback('🔙 Назад в меню', 'back_to_main')]);

          // Определяем текст сообщения в зависимости от того, есть ли у пользователя серверы
          const messageText = user && user.userServers && user.userServers.length > 0
            ? `📍 Выберите локацию:\n\nВыберите сервер для получения конфигурации или переключения.`
            : `🚀 Выберите локацию для подключения:\n\nПосле выбора вам будет предоставлен пробный период на 3 дня.`;

          await ctx.editMessageText(
            messageText,
            Markup.inlineKeyboard(buttons),
          );
        } catch (error: any) {
          this.logger.error('Error handling back to servers:', error);
          await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
        }
      });

      // Обработка команды /pay - показываем тарифы
      this.bot.command('pay', async (ctx: any) => {
        const telegramId = ctx.from.id.toString();

        try {
          const user = await this.prisma.vpnUser.findFirst({
            where: { telegramId },
          });

          if (!user) {
            await ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
            return;
          }

          // Получаем доступные тарифы для пользователя
          let plans = await this.plansService.list(user.id);
          this.logger.debug(`Found ${plans.length} plans for user ${user.id} (command /pay)`);
          
          let paidPlans = plans.filter((p: any) => !p.isTrial && p.active);
          this.logger.debug(`Found ${paidPlans.length} paid plans after filtering (command /pay)`);

          // Если для пользователя нет тарифов, показываем все активные (fallback)
          if (paidPlans.length === 0) {
            this.logger.warn(`No paid plans available for user ${user.id} (command /pay), trying to show all active plans`);
            const allActivePlans = await this.prisma.plan.findMany({
              where: { active: true, isTrial: false },
              orderBy: { price: 'asc' },
            });
            
            if (allActivePlans.length === 0) {
              await ctx.reply(
                '❌ Нет доступных тарифов для оплаты.\n\n' +
                'Обратитесь к администратору для активации тарифов.',
              );
              return;
            }
            
            // Используем все активные тарифы как fallback
            paidPlans = allActivePlans;
            this.logger.debug(`Using ${paidPlans.length} active plans as fallback (command /pay)`);
          }

          const buttons = paidPlans.map((plan: any) => [
            Markup.button.callback(
              `${plan.name} - ${plan.price} ${plan.currency} (${plan.periodDays} дн.)`,
              `select_plan_${plan.id}`,
            ),
          ]);
          
          // Добавляем кнопку "Назад"
          buttons.push([Markup.button.callback('🔙 Назад в меню', 'back_to_main')]);

          await ctx.reply(
            `💳 Выберите тариф для оплаты:\n\n` +
              `После оплаты подписка будет автоматически активирована.`,
            Markup.inlineKeyboard(buttons),
          );
        } catch (error: any) {
          this.logger.error('Error handling /pay command:', error);
          await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
        }
      });

      // Обработка выбора тарифа
      this.bot.action(/^select_plan_(.+)$/, async (ctx: any) => {
        const planId = ctx.match[1];
        const telegramId = ctx.from.id.toString();

        try {
          await ctx.answerCbQuery('⏳ Обрабатываем...');

          const user = await this.prisma.vpnUser.findFirst({
            where: { telegramId },
          });

          if (!user) {
            await ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
            return;
          }

          const plan = await this.prisma.plan.findUnique({
            where: { id: planId },
          });

          if (!plan || !plan.active || plan.isTrial) {
            await ctx.reply('❌ Тариф недоступен или не найден.');
            return;
          }

          // Создаём платеж и подписку
          // PaymentsService.create автоматически создаст подписку, если статус PAID
          await this.paymentsService.create({
            vpnUserId: user.id,
            planId: plan.id,
            amount: plan.price,
            currency: plan.currency,
            status: 'PAID',
          });

          // Пытаемся отредактировать сообщение
          try {
            await ctx.editMessageText(
              `✅ Платеж успешно обработан!\n\n` +
                `📦 Тариф: ${plan.name}\n` +
                `💰 Сумма: ${plan.price} ${plan.currency}\n` +
                `📅 Период: ${plan.periodDays} дней\n\n` +
                `Подписка активирована. Используйте /config для получения конфигурации.`,
            );
          } catch (editError: any) {
            // Если не удалось отредактировать, отправляем новое сообщение
            await ctx.reply(
              `✅ Платеж успешно обработан!\n\n` +
                `📦 Тариф: ${plan.name}\n` +
                `💰 Сумма: ${plan.price} ${plan.currency}\n` +
                `📅 Период: ${plan.periodDays} дней\n\n` +
                `Подписка активирована. Используйте /config для получения конфигурации.`,
            );
          }
        } catch (error: any) {
          this.logger.error('Error handling plan selection:', error);
          await ctx.answerCbQuery('❌ Ошибка при создании платежа');
          await ctx.reply(
            `❌ Произошла ошибка при обработке платежа.\n\n` +
              `Ошибка: ${error?.message || 'Неизвестная ошибка'}\n\n` +
              `Попробуйте позже или обратитесь к администратору.`,
          );
        }
      });

      // Обработка команды /config
      this.bot.command('config', async (ctx: any) => {
        this.logger.log('Command /config received');
        const telegramId = ctx.from.id.toString();

        try {
          const user = await this.prisma.vpnUser.findFirst({
            where: { telegramId },
            include: {
              userServers: {
                where: { isActive: true },
                include: { server: true },
              },
            },
          });

          if (!user) {
            await ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
            return;
          }

          if (user.status === 'BLOCKED') {
            await ctx.reply('❌ Ваш аккаунт заблокирован. Обратитесь к администратору.');
            return;
          }

          if (user.status === 'EXPIRED') {
            await ctx.reply(
              '❌ Ваша подписка истекла. Используйте /pay для продления подписки.',
            );
            return;
          }

          // Проверяем наличие активного сервера
          if (!user.userServers || user.userServers.length === 0) {
            await ctx.reply(
              '❌ У вас нет активного сервера.\n\n' +
              '📍 Используйте /start и выберите локацию для активации пробного периода.',
            );
            return;
          }

          const configResult = await this.usersService.getConfig(user.id);
          if (!configResult || !configResult.configs || configResult.configs.length === 0) {
            await ctx.reply(
              '❌ Конфигурация недоступна.\n\n' +
              'Возможные причины:\n' +
              '• У вас нет активного сервера\n' +
              '• Сервер временно недоступен\n\n' +
              '📍 Используйте /start и выберите локацию для активации.',
            );
            return;
          }

          // Берем первый конфиг (активная локация)
          const configUrl = configResult.configs[0].url;
          const serverName = configResult.configs[0].serverName;

          // Сначала отправляем QR код
          try {
            const QRCode = await import('qrcode');
            
            // Генерируем QR код как буфер
            const qrBuffer = await QRCode.toBuffer(configUrl, {
              errorCorrectionLevel: 'M',
              type: 'png',
              width: 400,
              margin: 2,
            });

            // Отправляем QR код как фото
            // Telegram не поддерживает протокол vless:// в URL-кнопках, поэтому отправляем только QR-код
            await ctx.replyWithPhoto(
              { source: qrBuffer },
              {
                caption: `📱 QR код для быстрого подключения (${serverName})\n\nОтсканируйте QR код в вашем VPN клиенте для автоматической настройки.`,
              },
            );
          } catch (qrError: any) {
            this.logger.error('Failed to generate QR code:', qrError);
            // Если не удалось сгенерировать QR - отправляем сообщение об ошибке
            await ctx.reply('⚠️ Не удалось сгенерировать QR код, но конфигурация доступна ниже.');
          }

          // Затем отправляем ссылку в более компактном виде
          // Показываем только начало и конец ссылки для экономии места
          const shortUrl = configUrl.length > 80 
            ? `${configUrl.substring(0, 60)}...${configUrl.substring(configUrl.length - 20)}`
            : configUrl;

          await ctx.reply(
            `📥 Конфигурация VPN (${serverName}):\n\n` +
              `\`\`\`\n${configUrl}\n\`\`\`\n\n` +
              `Скопируйте ссылку выше или используйте QR код.`,
            { parse_mode: 'Markdown' },
          );
        } catch (error: any) {
          this.logger.error('Error handling /config command:', error);
          await ctx.reply(
            '❌ Произошла ошибка при получении конфигурации.\n\n' +
            'Возможные причины:\n' +
            '• Проблемы с подключением к серверу\n' +
            '• Временная недоступность сервиса\n\n' +
            'Попробуйте позже или обратитесь в поддержку через /support.',
          );
        }
      });

      // Обработка команды /support (регистрируем до setupMenuHandlers)
      this.bot.command('support', async (ctx: any) => {
        this.logger.log('Command /support received');
        const telegramId = ctx.from.id.toString();
        
        try {
          const user = await this.prisma.vpnUser.findFirst({
            where: { telegramId },
          });

          if (!user) {
            this.logger.warn(`User not found for telegramId: ${telegramId}`);
            await ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
            return;
          }

          // Активируем режим поддержки для пользователя
          this.supportModeUsers.set(telegramId, true);
          this.logger.log(`Support mode activated for user: ${telegramId}`);

          await ctx.reply(
            '💬 Режим поддержки активирован.\n\n' +
              'Напишите ваш вопрос, и мы ответим вам в ближайшее время.\n\n' +
              'Для выхода из режима поддержки используйте команду /cancel или /start',
          );
        } catch (error: any) {
          this.logger.error('Error handling /support command:', error);
          await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
        }
      });

      // Обработка команды /help
      this.bot.command('help', async (ctx: any) => {
        try {
          const helpMessage = 
            `❓ Помощь и инструкции\n\n` +
            `📱 Приложения для подключения:\n\n` +
            `• iOS:\n` +
            `  - v2rayNG (App Store)\n` +
            `  - Shadowrocket (App Store)\n\n` +
            `• Android:\n` +
            `  - v2rayNG (Google Play / GitHub)\n` +
            `  - V2rayTun (Google Play)\n` +
            `  - Clash for Android\n\n` +
            `• Windows:\n` +
            `  - v2rayN (GitHub)\n` +
            `  - Clash for Windows\n\n` +
            `• macOS:\n` +
            `  - ClashX (GitHub)\n` +
            `  - v2rayU (GitHub)\n\n` +
            `• Linux:\n` +
            `  - v2ray-core (GitHub)\n` +
            `  - Qv2ray (GitHub)\n\n` +
            `📥 Как подключиться:\n\n` +
            `1. Скачайте приложение для вашей платформы\n` +
            `2. Используйте команду /config для получения конфигурации\n` +
            `3. Отсканируйте QR-код или скопируйте ссылку конфигурации\n` +
            `4. Импортируйте конфигурацию в приложение\n` +
            `5. Включите VPN соединение\n\n` +
            `🔗 Полезные ссылки:\n\n` +
            `• v2rayNG: https://github.com/2dust/v2rayNG\n` +
            `• v2rayN: https://github.com/2dust/v2rayN\n` +
            `• Clash: https://github.com/Dreamacro/clash\n\n` +
            `💡 Команды бота:\n\n` +
            `• /start - Главное меню\n` +
            `• /config - Получить конфигурацию\n` +
            `• /pay - Оплатить подписку\n` +
            `• /status - Статус подписки\n` +
            `• /support - Связаться с поддержкой\n` +
            `• /help - Показать эту справку\n\n` +
            `❓ Если возникли проблемы, используйте команду /support для связи с нами.`;

          await ctx.reply(helpMessage);
        } catch (error: any) {
          this.logger.error('Error handling /help command:', error);
          await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
        }
      });

      // Обработка команды /status (регистрируем до setupMenuHandlers)
      this.bot.command('status', async (ctx: any) => {
        this.logger.log('Command /status received');
        const telegramId = ctx.from.id.toString();

        try {
          const user = await this.prisma.vpnUser.findFirst({
            where: { telegramId },
            include: {
              subscriptions: {
                where: { active: true },
                orderBy: { endsAt: 'desc' },
                take: 1,
              },
              userServers: {
                where: { isActive: true },
                include: { server: true },
              },
            },
          });

          if (!user) {
            await ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
            return;
          }

          const statusEmoji: Record<string, string> = {
            ACTIVE: '✅',
            BLOCKED: '🚫',
            EXPIRED: '⏰',
          };

          let message = `${statusEmoji[user.status] || '❓'} Статус аккаунта: ${user.status}\n\n`;

          // Информация о подписке
          if (user.expiresAt) {
            const expiresAt = new Date(user.expiresAt);
            const now = new Date();
            const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            if (daysLeft > 0) {
              message += `📅 Подписка действительна до: ${expiresAt.toLocaleDateString('ru-RU')}\n`;
              message += `⏳ Осталось дней: ${daysLeft}\n`;
            } else {
              message += `⏰ Подписка истекла\n`;
              message += `💳 Используйте /pay для продления подписки\n`;
            }
          } else {
            message += `📅 Подписка не установлена\n`;
            if (!user.userServers || user.userServers.length === 0) {
              message += `📍 Используйте /start и выберите локацию для активации пробного периода\n`;
            }
          }

          // Информация об активных серверах
          if (user.userServers && user.userServers.length > 0) {
            message += `\n🌐 Активные серверы:\n`;
            user.userServers.forEach((userServer: any) => {
              message += `  • ${userServer.server.name}\n`;
            });
          } else {
            message += `\n🌐 Активных серверов нет\n`;
            message += `📍 Используйте /start для выбора локации\n`;
          }

          // Информация о подписках
          if (user.subscriptions && user.subscriptions.length > 0) {
            const activeSubscription = user.subscriptions[0];
            message += `\n📦 Активная подписка:\n`;
            message += `  • Период: ${activeSubscription.periodDays} дней\n`;
            message += `  • Начало: ${new Date(activeSubscription.startsAt).toLocaleDateString('ru-RU')}\n`;
            message += `  • Конец: ${new Date(activeSubscription.endsAt).toLocaleDateString('ru-RU')}\n`;
          }

          await ctx.reply(message);
        } catch (error: any) {
          this.logger.error('Error handling /status command:', error);
          await ctx.reply(
            '❌ Произошла ошибка при получении статуса.\n\n' +
            'Возможные причины:\n' +
            '• Проблемы с подключением к базе данных\n' +
            '• Временная недоступность сервиса\n\n' +
            'Попробуйте позже или обратитесь в поддержку через /support.',
          );
        }
      });

      // Настраиваем обработчики для кнопок главного меню
      this.setupMenuHandlers();

      // Обработка ошибок
      this.bot.catch((err: any, ctx: any) => {
        this.logger.error('Bot error:', err);
        ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
      });

      // Регистрируем команды бота для отображения в меню
      await this.bot.telegram.setMyCommands([
        { command: 'start', description: '🏠 Главное меню' },
        { command: 'config', description: '📥 Получить конфигурацию VPN' },
        { command: 'pay', description: '💳 Оплатить подписку' },
        { command: 'status', description: '📊 Статус подписки' },
        { command: 'support', description: '💬 Поддержка' },
        { command: 'help', description: '❓ Помощь и инструкции' },
        { command: 'cancel', description: '❌ Отменить режим поддержки' },
      ]);

      // Регистрируем команды бота для отображения в меню Telegram
      try {
        await this.bot.telegram.setMyCommands([
          { command: 'start', description: '🏠 Главное меню' },
          { command: 'config', description: '📥 Получить конфигурацию VPN' },
          { command: 'pay', description: '💳 Оплатить подписку' },
          { command: 'status', description: '📊 Статус подписки' },
          { command: 'support', description: '💬 Поддержка' },
          { command: 'help', description: '❓ Помощь и инструкции' },
          { command: 'cancel', description: '❌ Отменить режим поддержки' },
        ]);
        this.logger.log('Bot commands registered successfully');
      } catch (error: any) {
        this.logger.warn('Failed to register bot commands:', error);
        // Продолжаем запуск даже если не удалось зарегистрировать команды
      }

      // Запуск бота
      await this.bot.launch();
      this.isRunning = true;
      this.logger.log('Telegram bot started successfully');

      // Graceful stop
      process.once('SIGINT', () => this.stopBot());
      process.once('SIGTERM', () => this.stopBot());
    } catch (error: any) {
      this.logger.error('Failed to start bot:', error);
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Маскирует IP адрес сервера для безопасности
   */
  private maskServerHost(host: string): string {
    // Если это IP адрес (содержит только цифры и точки)
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const parts = host.split('.');
      // Показываем только первые две части, остальные заменяем на *
      return `${parts[0]}.${parts[1]}.*.*`;
    }
    // Если это домен - показываем только первую часть
    const domainParts = host.split('.');
    if (domainParts.length > 2) {
      return `*.${domainParts.slice(-2).join('.')}`;
    }
    // Если короткий домен - показываем как есть или маскируем
    return host.length > 10 ? `${host.substring(0, 3)}***` : '***';
  }

  private async showMainMenu(ctx: any, user: any) {
    const { Markup } = await import('telegraf');
    const miniAppUrl = this.config.get<string>('TELEGRAM_MINI_APP_URL');

    const buttons: any[] = [
      [Markup.button.callback('📥 Получить конфиг', 'get_config')],
      [Markup.button.callback('💳 Оплатить подписку', 'show_pay')],
      [Markup.button.callback('📊 Статус подписки', 'show_status')],
      [Markup.button.callback('📍 Выбрать другую локацию', 'back_to_servers')],
    ];

    // Кнопка mini‑app доступна только для HTTPS URL (требование Telegram)
    if (miniAppUrl && miniAppUrl.startsWith('https://')) {
      buttons.push([Markup.button.webApp('📱 Открыть мини‑приложение', miniAppUrl)]);
    }

    await ctx.reply('🏠 Главное меню:', Markup.inlineKeyboard(buttons));
  }

  // Обработчики для кнопок главного меню
  private setupMenuHandlers() {
    this.bot.action('get_config', async (ctx: any) => {
      const telegramId = ctx.from.id.toString();
      const user = await this.prisma.vpnUser.findFirst({
        where: { telegramId },
      });

      if (!user) {
        await ctx.answerCbQuery('❌ Пользователь не найден');
        return;
      }

      if (user.status === 'EXPIRED') {
        await ctx.answerCbQuery('❌ Подписка истекла. Используйте /pay');
        return;
      }

      const configResult = await this.usersService.getConfig(user.id);
      if (!configResult || !configResult.configs || configResult.configs.length === 0) {
        await ctx.answerCbQuery('❌ Конфигурация недоступна');
        return;
      }

      const configUrl = configResult.configs[0].url;
      const serverName = configResult.configs[0].serverName;

      await ctx.answerCbQuery();

      // Сначала отправляем QR код
      try {
        const QRCode = await import('qrcode');
        const { Markup } = await import('telegraf');
        
        const qrBuffer = await QRCode.toBuffer(configUrl, {
          errorCorrectionLevel: 'M',
          type: 'png',
          width: 400,
          margin: 2,
        });

        // Telegram не поддерживает протокол vless:// в URL-кнопках, поэтому отправляем только QR-код
        await ctx.replyWithPhoto(
          { source: qrBuffer },
          {
            caption: `📱 QR код для быстрого подключения (${serverName})\n\nОтсканируйте QR код в вашем VPN клиенте для автоматической настройки.`,
          },
        );
      } catch (qrError: any) {
        this.logger.error('Failed to generate QR code:', qrError);
      }

      // Затем отправляем ссылку (кнопка выбора локации теперь в главном меню)
      await ctx.reply(
        `📥 Конфигурация VPN (${serverName}):\n\n` +
          `\`\`\`\n${configUrl}\n\`\`\`\n\n` +
          `Скопируйте ссылку выше или используйте QR код.`,
        { parse_mode: 'Markdown' },
      );
    });

    this.bot.action('show_pay', async (ctx: any) => {
      const telegramId = ctx.from.id.toString();

      try {
        const user = await this.prisma.vpnUser.findFirst({
          where: { telegramId },
        });

        if (!user) {
          await ctx.answerCbQuery('❌ Пользователь не найден');
          return;
        }

        // Получаем доступные тарифы для пользователя
        let plans = await this.plansService.list(user.id);
        this.logger.debug(`Found ${plans.length} plans for user ${user.id}`);
        
        let paidPlans = plans.filter((p) => !p.isTrial && p.active);
        this.logger.debug(`Found ${paidPlans.length} paid plans after filtering`);

        // Если для пользователя нет тарифов, показываем все активные (fallback)
        if (paidPlans.length === 0) {
          this.logger.warn(`No paid plans available for user ${user.id}, trying to show all active plans`);
          const allActivePlans = await this.prisma.plan.findMany({
            where: { active: true, isTrial: false },
            orderBy: { price: 'asc' },
          });
          
          if (allActivePlans.length === 0) {
            await ctx.answerCbQuery('❌ Нет доступных тарифов');
            await ctx.reply(
              '❌ Нет доступных тарифов для оплаты.\n\n' +
              'Обратитесь к администратору для активации тарифов.',
            );
            return;
          }
          
          // Используем все активные тарифы как fallback
          paidPlans = allActivePlans;
          this.logger.debug(`Using ${paidPlans.length} active plans as fallback`);
        }

        const { Markup } = await import('telegraf');
        const buttons = paidPlans.map((plan) => [
          Markup.button.callback(
            `${plan.name} - ${plan.price} ${plan.currency} (${plan.periodDays} дн.)`,
            `select_plan_${plan.id}`,
          ),
        ]);
        
        // Добавляем кнопку "Назад"
        buttons.push([Markup.button.callback('🔙 Назад в меню', 'back_to_main')]);

        await ctx.answerCbQuery();
        
        // Пытаемся отредактировать сообщение, если это возможно
        try {
          await ctx.editMessageText(
            `💳 Выберите тариф для оплаты:\n\n` +
              `После оплаты подписка будет автоматически активирована.`,
            Markup.inlineKeyboard(buttons),
          );
        } catch (editError: any) {
          // Если не удалось отредактировать (например, сообщение слишком старое), отправляем новое
          await ctx.reply(
            `💳 Выберите тариф для оплаты:\n\n` +
              `После оплаты подписка будет автоматически активирована.`,
            Markup.inlineKeyboard(buttons),
          );
        }
      } catch (error: any) {
        this.logger.error('Error handling show_pay action:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
        await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
      }
    });

    // Обработка кнопки "Назад в меню"
    this.bot.action('back_to_main', async (ctx: any) => {
      const telegramId = ctx.from.id.toString();

      try {
        const user = await this.prisma.vpnUser.findFirst({
          where: { telegramId },
          include: { userServers: true },
        });

        if (!user) {
          await ctx.answerCbQuery('❌ Пользователь не найден');
          return;
        }

        await ctx.answerCbQuery();
        
        // Пытаемся отредактировать сообщение, если это возможно
        try {
          const { Markup } = await import('telegraf');
          const miniAppUrl = this.config.get<string>('TELEGRAM_MINI_APP_URL');
          const buttons: any[] = [
            [Markup.button.callback('📥 Получить конфиг', 'get_config')],
            [Markup.button.callback('💳 Оплатить подписку', 'show_pay')],
            [Markup.button.callback('📊 Статус подписки', 'show_status')],
            [Markup.button.callback('📍 Выбрать другую локацию', 'back_to_servers')],
          ];

          if (miniAppUrl && miniAppUrl.startsWith('https://')) {
            buttons.push([Markup.button.webApp('📱 Открыть мини‑приложение', miniAppUrl)]);
          }

          await ctx.editMessageText('🏠 Главное меню:', Markup.inlineKeyboard(buttons));
        } catch (editError: any) {
          // Если не удалось отредактировать, отправляем новое сообщение
          await this.showMainMenu(ctx, user);
        }
      } catch (error: any) {
        this.logger.error('Error handling back_to_main action:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });

    this.bot.action('show_status', async (ctx: any) => {
      const telegramId = ctx.from.id.toString();

      try {
        const user = await this.prisma.vpnUser.findFirst({
          where: { telegramId },
          include: {
            subscriptions: {
              where: { active: true },
              orderBy: { endsAt: 'desc' },
              take: 1,
            },
          },
        });

        if (!user) {
          await ctx.answerCbQuery('❌ Пользователь не найден');
          return;
        }

        const statusEmoji: Record<string, string> = {
          ACTIVE: '✅',
          BLOCKED: '🚫',
          EXPIRED: '⏰',
        };

        // Формируем текст статуса
        let statusText = `\n\n${statusEmoji[user.status] || '❓'} Статус: ${user.status}`;

        if (user.expiresAt) {
          const expiresAt = new Date(user.expiresAt);
          const now = new Date();
          const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

          if (daysLeft > 0) {
            statusText += `\n📅 До: ${expiresAt.toLocaleDateString('ru-RU')}`;
            statusText += `\n⏳ Осталось: ${daysLeft} дн.`;
          } else {
            statusText += `\n⏰ Подписка истекла`;
          }
        } else {
          statusText += `\n📅 Подписка не установлена`;
        }

        const { Markup } = await import('telegraf');
        const miniAppUrl = this.config.get<string>('TELEGRAM_MINI_APP_URL');
        const buttons: any[] = [
          [Markup.button.callback('📥 Получить конфиг', 'get_config')],
          [Markup.button.callback('💳 Оплатить подписку', 'show_pay')],
          [Markup.button.callback('📊 Статус подписки', 'show_status')],
          [Markup.button.callback('📍 Выбрать другую локацию', 'back_to_servers')],
        ];

        if (miniAppUrl && miniAppUrl.startsWith('https://')) {
          buttons.push([Markup.button.webApp('📱 Открыть мини‑приложение', miniAppUrl)]);
        }

        await ctx.answerCbQuery();
        
        // Редактируем сообщение главного меню, добавляя статус
        try {
          await ctx.editMessageText(
            `🏠 Главное меню:${statusText}`,
            Markup.inlineKeyboard(buttons),
          );
        } catch (editError: any) {
          // Если не удалось отредактировать, отправляем новое сообщение
          await ctx.reply(
            `🏠 Главное меню:${statusText}`,
            Markup.inlineKeyboard(buttons),
          );
        }
      } catch (error: any) {
        this.logger.error('Error handling show_status action:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });

    // Обработка кнопки "Поддержка"
    this.bot.action('start_support', async (ctx: any) => {
      const telegramId = ctx.from.id.toString();
      
      try {
        const user = await this.prisma.vpnUser.findFirst({
          where: { telegramId },
        });

        if (!user) {
          await ctx.answerCbQuery('❌ Пользователь не найден');
          return;
        }

        // Активируем режим поддержки для пользователя
        this.supportModeUsers.set(telegramId, true);

        await ctx.answerCbQuery();
        await ctx.reply(
          '💬 Режим поддержки активирован.\n\n' +
            'Напишите ваш вопрос, и мы ответим вам в ближайшее время.\n\n' +
            'Для выхода из режима поддержки используйте команду /cancel или /start',
        );
      } catch (error: any) {
        this.logger.error('Error starting support mode:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
      }
    });

    // Обработка текстовых сообщений от пользователей (для поддержки)
    // Обрабатываем только если пользователь находится в режиме поддержки
    this.bot.on('text', async (ctx: any) => {
      // Пропускаем команды
      if (ctx.message.text?.startsWith('/')) {
        return;
      }

      const telegramId = ctx.from.id.toString();

      // Проверяем, находится ли пользователь в режиме поддержки
      if (!this.supportModeUsers.get(telegramId)) {
        // Если не в режиме поддержки, игнорируем сообщение
        return;
      }

      const messageText = ctx.message.text;

      if (!messageText || messageText.trim().length === 0) {
        return;
      }

      try {
        // Находим пользователя
        const user = await this.prisma.vpnUser.findFirst({
          where: { telegramId },
        });

        if (!user) {
          await ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
          this.supportModeUsers.delete(telegramId);
          return;
        }

        // Сохраняем сообщение в поддержку
        await this.supportService.create({
          vpnUserId: user.id,
          type: SupportMessageType.USER_MESSAGE,
          message: messageText,
        });

        await ctx.reply(
          '✅ Ваше сообщение отправлено в поддержку. Мы ответим вам в ближайшее время.\n\n' +
            'Вы можете продолжить общение, просто отправьте новое сообщение.\n' +
            'Для выхода из режима поддержки используйте команду /cancel или /start',
        );
      } catch (error: any) {
        this.logger.error('Error handling user message:', error);
        await ctx.reply('❌ Произошла ошибка при отправке сообщения. Попробуйте позже.');
      }
    });
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
      await this.bot.telegram.sendMessage(telegramId, `💬 Ответ от поддержки:\n\n${message}`);
      this.logger.log(`Support reply sent successfully to ${telegramId}`);
    } catch (error: any) {
      this.logger.error(`Failed to send support reply to ${telegramId}:`, error);
      // Не пробрасываем ошибку дальше, чтобы не прерывать создание ответа в БД
    }
  }

  async stopBot() {
    if (!this.bot) {
      this.isRunning = false;
      return;
    }

    try {
      if (this.isRunning) {
        await this.bot.stop();
      }
      this.isRunning = false;
      // Не удаляем this.bot, так как он может быть переиспользован
      this.logger.log('Telegram bot stopped');
    } catch (error: any) {
      this.logger.error('Error stopping bot:', error);
      // Все равно сбрасываем флаг, даже если была ошибка
      this.isRunning = false;
    }
  }

  async restartBot() {
    // Если уже идет процесс запуска, не перезапускаем
    if (this.isStarting) {
      this.logger.debug('Bot is already starting/restarting, skipping duplicate restart');
      return;
    }

    this.logger.log('Restarting bot...');
    await this.stopBot();
    // Даем время на полную остановку
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.startBot();
  }
}
