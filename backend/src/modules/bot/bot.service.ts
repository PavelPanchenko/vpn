import { BadRequestException, Injectable, NotFoundException, Inject, forwardRef, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBotConfigDto } from './dto/create-bot-config.dto';
import { UpdateBotConfigDto } from './dto/update-bot-config.dto';
import { SecretBox } from '../../common/crypto/secret-box';
import { TelegramBotService } from './telegram-bot.service';

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);
  private botMeCache: { value: { name: string; username?: string | null }; expiresAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => TelegramBotService))
    private readonly telegramBotService: TelegramBotService,
  ) {}

  private getEncryptionSecret(): string {
    return this.config.getOrThrow<string>('PANEL_CRED_SECRET');
  }

  private maskConfig<T extends Record<string, unknown>>(config: T) {
    // never return encrypted/sensitive fields to frontend
    const { tokenEnc, cryptocloudApiKeyEnc, cryptocloudSecretKeyEnc, plategaMerchantIdEnc, plategaSecretEnc, ...rest } = config as any;
    return {
      ...rest,
      hasCryptocloudApiKey: !!cryptocloudApiKeyEnc,
      hasCryptocloudSecretKey: !!cryptocloudSecretKeyEnc,
      hasPlategaMerchantId: !!plategaMerchantIdEnc,
      hasPlategaSecret: !!plategaSecretEnc,
    };
  }

  private buildDefaultPaymentMethods(): Array<{ key: string; enabled: boolean; allowedLangs: string[] }> {
    return [
      { key: 'TELEGRAM_STARS', enabled: true, allowedLangs: [] }, // for all languages
      { key: 'PLATEGA', enabled: true, allowedLangs: ['ru'] }, // RUB only for ru by default
      { key: 'CRYPTOCLOUD', enabled: false, allowedLangs: [] }, // off by default (can be enabled via admin)
    ];
  }

  private mergePaymentMethods(args: {
    defaults: Array<{ key: string; enabled: boolean; allowedLangs: string[] }>;
    overrides?: Array<{ key: string; enabled?: boolean; allowedLangs?: string[] }> | null;
  }) {
    const map = new Map(args.defaults.map((m) => [m.key, { ...m }]));
    for (const o of args.overrides ?? []) {
      const prev = map.get(o.key);
      if (!prev) continue;
      if (o.enabled !== undefined) prev.enabled = o.enabled;
      if (o.allowedLangs !== undefined) prev.allowedLangs = o.allowedLangs;
      map.set(o.key, prev);
    }
    return Array.from(map.values());
  }

  async get() {
    const config = await this.prisma.botConfig.findFirst({
      orderBy: { createdAt: 'desc' },
      include: { paymentMethods: { orderBy: { key: 'asc' } } as any },
    });
    if (!config) {
      return null;
    }
    return this.maskConfig(config);
  }

  async getToken(): Promise<string | null> {
    const config = await this.prisma.botConfig.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!config) {
      return null;
    }
    try {
      return SecretBox.decrypt(config.tokenEnc, this.getEncryptionSecret());
    } catch (error) {
      throw new BadRequestException('Failed to decrypt bot token');
    }
  }

  /** Сбросить кэш имени бота (вызывать при смене токена в create/update). */
  clearBotMeCache(): void {
    this.botMeCache = null;
  }

  async getBotMe(): Promise<{ name: string; username?: string | null }> {
    const now = Date.now();
    if (this.botMeCache && this.botMeCache.expiresAt > now) return this.botMeCache.value;

    const token = await this.getToken();
    if (!token) return { name: 'VPN', username: null };

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const json = (await res.json()) as
        | { ok?: boolean; result?: { first_name?: string; username?: string } }
        | undefined;
      const name =
        json?.ok && json?.result
          ? (json.result.first_name || json.result.username || 'VPN')
          : 'VPN';
      const username = json?.ok && json?.result ? (json.result.username ?? null) : null;
      const value = { name, username };
      this.botMeCache = { value, expiresAt: now + 10 * 60 * 1000 };
      return value;
    } catch {
      return { name: 'VPN', username: null };
    }
  }

  async create(dto: CreateBotConfigDto) {
    this.clearBotMeCache();
    const tokenEnc = SecretBox.encrypt(dto.token, this.getEncryptionSecret());
    const activate = dto.active ?? false;

    const created = await this.prisma.$transaction(async (tx) => {
      // Если создаём новую активную конфигурацию — автоматически деактивируем предыдущие.
      // Это упрощает UX: не нужно вручную “Deactivate” перед “Create”.
      if (activate) {
        await tx.botConfig.updateMany({
          where: { active: true },
          data: { active: false },
        });
      }

      const botConfig = await tx.botConfig.create({
        data: {
          tokenEnc,
          active: activate,
          ...this.buildSettingsData(dto),
        },
      });

      const methods = this.mergePaymentMethods({
        defaults: this.buildDefaultPaymentMethods(),
        overrides: dto.paymentMethods ?? null,
      });

      await (tx as any).botPaymentMethod.createMany({
        data: methods.map((m) => ({
          botConfigId: botConfig.id,
          key: m.key,
          enabled: m.enabled,
          allowedLangs: m.allowedLangs,
        })),
      });

      return botConfig;
    });

    // Если бот активирован, запускаем его асинхронно (не блокируем ответ)
    if (created.active) {
      this.telegramBotService.restartBot().catch((err) => {
        // Логируем ошибку, но не блокируем ответ
        this.logger.error('Failed to restart bot after creation:', err);
      });
      
      // Логируем информацию о доступности существующих пользователей
      const usersCount = await this.prisma.vpnUser.count({
        where: { telegramId: { not: null } },
      });
      if (usersCount > 0) {
        this.logger.log(
          `New bot activated. ${usersCount} existing users will be automatically available (identified by telegramId).`,
        );
      }
    }

    const full = await this.prisma.botConfig.findUnique({
      where: { id: created.id },
      include: { paymentMethods: { orderBy: { key: 'asc' } } as any },
    });
    return this.maskConfig(full as any);
  }

  async update(id: string, dto: UpdateBotConfigDto) {
    const config = await this.prisma.botConfig.findUnique({ where: { id } });
    if (!config) {
      throw new NotFoundException('Bot configuration not found');
    }

    // Если активируем новую конфигурацию, деактивируем остальные
    if (dto.active === true) {
      await this.prisma.botConfig.updateMany({
        where: { id: { not: id }, active: true },
        data: { active: false },
      });
    }

    const updateData: Record<string, unknown> = {};
    const isTokenChanging = dto.token !== undefined;
    
    if (isTokenChanging && dto.token) {
      this.clearBotMeCache();
      updateData.tokenEnc = SecretBox.encrypt(dto.token, this.getEncryptionSecret());
    }
    if (dto.active !== undefined) {
      updateData.active = dto.active;
    }
    Object.assign(updateData, this.buildSettingsData(dto));

    const updated = await this.prisma.$transaction(async (tx) => {
      const botConfig = await tx.botConfig.update({ where: { id }, data: updateData });

      if (dto.paymentMethods) {
        for (const m of dto.paymentMethods) {
          await (tx as any).botPaymentMethod.upsert({
            where: { botConfigId_key: { botConfigId: botConfig.id, key: m.key } },
            create: {
              botConfigId: botConfig.id,
              key: m.key,
              enabled: m.enabled ?? true,
              allowedLangs: m.allowedLangs ?? [],
            },
            update: {
              ...(m.enabled !== undefined ? { enabled: m.enabled } : {}),
              ...(m.allowedLangs !== undefined ? { allowedLangs: m.allowedLangs } : {}),
            },
          });
        }
      }

      return botConfig;
    });

    // Если токен или статус изменился, перезапускаем бота асинхронно (не блокируем ответ)
    if (isTokenChanging || dto.active !== undefined || dto.paymentMethods !== undefined) {
      this.telegramBotService.restartBot().catch((err) => {
        // Логируем ошибку, но не блокируем ответ
        this.logger.error('Failed to restart bot after update:', err);
      });
      
      // Логируем информацию о миграции пользователей
      if (isTokenChanging && updated.active) {
        const usersCount = await this.prisma.vpnUser.count({
          where: { telegramId: { not: null } },
        });
        this.logger.log(
          `Bot token updated. ${usersCount} existing users will be automatically available in the new bot (identified by telegramId).`,
        );
      }
    }

    const full = await this.prisma.botConfig.findUnique({
      where: { id: updated.id },
      include: { paymentMethods: { orderBy: { key: 'asc' } } as any },
    });
    return this.maskConfig(full as any);
  }

  // ─── Helper: собирает данные новых настроек из DTO для create/update ───
  private buildSettingsData(dto: Partial<CreateBotConfigDto>): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    const secret = this.getEncryptionSecret();

    if (dto.cryptocloudApiKey !== undefined) {
      data.cryptocloudApiKeyEnc = dto.cryptocloudApiKey ? SecretBox.encrypt(dto.cryptocloudApiKey, secret) : null;
    }
    if (dto.cryptocloudSecretKey !== undefined) {
      data.cryptocloudSecretKeyEnc = dto.cryptocloudSecretKey ? SecretBox.encrypt(dto.cryptocloudSecretKey, secret) : null;
    }
    if (dto.cryptocloudShopId !== undefined) data.cryptocloudShopId = dto.cryptocloudShopId || null;
    if (dto.publicSiteUrl !== undefined) data.publicSiteUrl = dto.publicSiteUrl || null;
    if (dto.publicSupportTelegram !== undefined) data.publicSupportTelegram = dto.publicSupportTelegram || null;
    if (dto.publicSupportEmail !== undefined) data.publicSupportEmail = dto.publicSupportEmail || null;
    if (dto.publicCompanyName !== undefined) data.publicCompanyName = dto.publicCompanyName || null;
    if (dto.panelClientLimitIp !== undefined) data.panelClientLimitIp = dto.panelClientLimitIp ?? null;
    if (dto.telegramMiniAppUrl !== undefined) data.telegramMiniAppUrl = dto.telegramMiniAppUrl || null;

    // Platega
    if (dto.plategaMerchantId !== undefined) {
      data.plategaMerchantIdEnc = dto.plategaMerchantId ? SecretBox.encrypt(dto.plategaMerchantId, secret) : null;
    }
    if (dto.plategaSecret !== undefined) {
      data.plategaSecretEnc = dto.plategaSecret ? SecretBox.encrypt(dto.plategaSecret, secret) : null;
    }
    if (dto.plategaPaymentMethod !== undefined) data.plategaPaymentMethod = dto.plategaPaymentMethod ?? null;
    if (dto.plategaReturnUrl !== undefined) data.plategaReturnUrl = dto.plategaReturnUrl || null;
    if (dto.plategaFailedUrl !== undefined) data.plategaFailedUrl = dto.plategaFailedUrl || null;

    return data;
  }

  // ─── Getter-методы с fallback на env ───

  /** Получить активный конфиг из БД (кэш не нужен — запросы редкие). */
  private async getActiveConfig() {
    return this.prisma.botConfig.findFirst({ where: { active: true }, orderBy: { createdAt: 'desc' } });
  }

  async getSetting<K extends string>(field: K, envKey: string): Promise<string | null> {
    const cfg = await this.getActiveConfig();
    const dbVal = cfg ? (cfg as any)[field] : null;
    if (dbVal) return dbVal;
    return this.config.get<string>(envKey) || null;
  }

  async getEncryptedSetting(field: string, envKey: string): Promise<string | null> {
    const cfg = await this.getActiveConfig();
    const dbVal = cfg ? (cfg as any)[field] : null;
    if (dbVal) {
      try { return SecretBox.decrypt(dbVal, this.getEncryptionSecret()); } catch { return null; }
    }
    return this.config.get<string>(envKey) || null;
  }

  async getCryptocloudApiKey(): Promise<string | null> {
    return this.getEncryptedSetting('cryptocloudApiKeyEnc', 'CRYPTOCLOUD_API_KEY');
  }

  async getCryptocloudShopId(): Promise<string | null> {
    return this.getSetting('cryptocloudShopId', 'CRYPTOCLOUD_SHOP_ID');
  }

  async getCryptocloudSecretKey(): Promise<string | null> {
    return this.getEncryptedSetting('cryptocloudSecretKeyEnc', 'CRYPTOCLOUD_SECRET_KEY');
  }

  async getPublicSiteUrl(): Promise<string | null> {
    return this.getSetting('publicSiteUrl', 'PUBLIC_SITE_URL');
  }

  async getPublicSupportTelegram(): Promise<string | null> {
    return this.getSetting('publicSupportTelegram', 'PUBLIC_SUPPORT_TELEGRAM');
  }

  async getPublicSupportEmail(): Promise<string | null> {
    return this.getSetting('publicSupportEmail', 'PUBLIC_SUPPORT_EMAIL');
  }

  async getPublicCompanyName(): Promise<string | null> {
    return this.getSetting('publicCompanyName', 'PUBLIC_COMPANY_NAME');
  }

  async getPanelClientLimitIp(): Promise<number> {
    const cfg = await this.getActiveConfig();
    if (cfg?.panelClientLimitIp != null) return cfg.panelClientLimitIp;
    const v = this.config.get<string>('PANEL_CLIENT_LIMIT_IP');
    if (v == null || v === '') return 2;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : 2;
  }

  async getTelegramMiniAppUrl(): Promise<string | null> {
    return this.getSetting('telegramMiniAppUrl', 'TELEGRAM_MINI_APP_URL');
  }

  // ─── Platega ───

  async getPlategaMerchantId(): Promise<string | null> {
    return this.getEncryptedSetting('plategaMerchantIdEnc', 'PLATEGA_MERCHANT_ID');
  }

  async getPlategaSecret(): Promise<string | null> {
    return this.getEncryptedSetting('plategaSecretEnc', 'PLATEGA_SECRET');
  }

  async getPlategaPaymentMethod(): Promise<number> {
    const cfg = await this.getActiveConfig();
    if (cfg?.plategaPaymentMethod != null) return cfg.plategaPaymentMethod;
    const v = this.config.get<string>('PLATEGA_PAYMENT_METHOD', '2');
    const n = Number(v);
    return Number.isFinite(n) ? n : 2;
  }

  async getPlategaReturnUrl(): Promise<string | null> {
    return this.getSetting('plategaReturnUrl', 'PLATEGA_RETURN_URL');
  }

  async getPlategaFailedUrl(): Promise<string | null> {
    return this.getSetting('plategaFailedUrl', 'PLATEGA_FAILED_URL');
  }

  async remove(id: string) {
    const config = await this.prisma.botConfig.findUnique({ where: { id } });
    if (!config) {
      throw new NotFoundException('Bot configuration not found');
    }

    // Если удаляемая конфигурация была активной, останавливаем бота
    if (config.active) {
      this.telegramBotService.stopBot().catch((err) => {
        this.logger.error('Failed to stop bot before deletion:', err);
      });
    }

    await this.prisma.botConfig.delete({ where: { id } });
    return { message: 'Bot configuration deleted' };
  }
}
