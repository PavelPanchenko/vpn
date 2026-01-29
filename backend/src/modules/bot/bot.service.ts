import { BadRequestException, Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBotConfigDto } from './dto/create-bot-config.dto';
import { UpdateBotConfigDto } from './dto/update-bot-config.dto';
import { SecretBox } from '../../common/crypto/secret-box';
import { TelegramBotService } from './telegram-bot.service';

@Injectable()
export class BotService {
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

  private maskConfig(config: any) {
    // never return encrypted token to frontend
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tokenEnc, ...rest } = config;
    return rest;
  }

  async get() {
    const config = await this.prisma.botConfig.findFirst({
      orderBy: { createdAt: 'desc' },
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
      const json: any = await res.json();
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

      return tx.botConfig.create({
        data: {
          tokenEnc,
          active: activate,
          useMiniApp: dto.useMiniApp ?? false,
        },
      });
    });

    // Если бот активирован, запускаем его асинхронно (не блокируем ответ)
    if (created.active) {
      this.telegramBotService.restartBot().catch((err) => {
        // Логируем ошибку, но не блокируем ответ
        console.error('Failed to restart bot after creation:', err);
      });
      
      // Логируем информацию о доступности существующих пользователей
      const usersCount = await this.prisma.vpnUser.count({
        where: { telegramId: { not: null } },
      });
      if (usersCount > 0) {
        console.log(`New bot activated. ${usersCount} existing users will be automatically available (identified by telegramId).`);
      }
    }

    return this.maskConfig(created);
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

    const updateData: any = {};
    const isTokenChanging = dto.token !== undefined;
    
    if (isTokenChanging && dto.token) {
      this.clearBotMeCache();
      // При смене токена бота все пользователи остаются доступными,
      // так как они идентифицируются по telegramId, а не по botId
      updateData.tokenEnc = SecretBox.encrypt(dto.token, this.getEncryptionSecret());
    }
    if (dto.active !== undefined) {
      updateData.active = dto.active;
    }
    if (dto.useMiniApp !== undefined) {
      updateData.useMiniApp = dto.useMiniApp;
    }

    const updated = await this.prisma.botConfig.update({
      where: { id },
      data: updateData,
    });

    // Если токен или статус изменился, перезапускаем бота асинхронно (не блокируем ответ)
    if (isTokenChanging || dto.active !== undefined || dto.useMiniApp !== undefined) {
      this.telegramBotService.restartBot().catch((err) => {
        // Логируем ошибку, но не блокируем ответ
        console.error('Failed to restart bot after update:', err);
      });
      
      // Логируем информацию о миграции пользователей
      if (isTokenChanging && updated.active) {
        const usersCount = await this.prisma.vpnUser.count({
          where: { telegramId: { not: null } },
        });
        console.log(`Bot token updated. ${usersCount} existing users will be automatically available in the new bot (identified by telegramId).`);
      }
    }

    return this.maskConfig(updated);
  }

  async remove(id: string) {
    const config = await this.prisma.botConfig.findUnique({ where: { id } });
    if (!config) {
      throw new NotFoundException('Bot configuration not found');
    }

    // Если удаляемая конфигурация была активной, останавливаем бота
    if (config.active) {
      this.telegramBotService.stopBot().catch((err) => {
        console.error('Failed to stop bot before deletion:', err);
      });
    }

    await this.prisma.botConfig.delete({ where: { id } });
    return { message: 'Bot configuration deleted' };
  }
}
