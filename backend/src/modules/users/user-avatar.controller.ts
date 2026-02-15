import { Controller, Get, Logger, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { IdParamDto } from '../../common/dto/id-param.dto';
import { UsersService } from './users.service';
import { TelegramBotService } from '../bot/telegram-bot.service';

/** In-memory кэш аватаров: telegramId → { buffer, contentType, cachedAt } */
const avatarCache = new Map<string, { buffer: Buffer; contentType: string; cachedAt: number }>();
const AVATAR_CACHE_TTL_MS = 60 * 60 * 1000; // 1 час

/** Негативный кэш: telegramId → timestamp, когда зафиксировали «user not found» */
const avatarNotFoundCache = new Map<string, number>();
const AVATAR_NOT_FOUND_TTL_MS = 24 * 60 * 60 * 1000; // 24 часа

/**
 * Публичный контроллер (без авторизации) для отдачи Telegram-аватаров.
 * Нужен отдельно, т.к. <img src="..."> не может передать JWT-заголовок.
 */
@Controller('users')
export class UserAvatarController {
  private readonly logger = new Logger(UserAvatarController.name);

  constructor(
    private readonly users: UsersService,
    private readonly telegramBot: TelegramBotService,
  ) {}

  @Get(':id/avatar')
  async getAvatar(@Param() params: IdParamDto, @Res() res: Response) {
    const user = await this.users.get(params.id);
    if (!user.telegramId) {
      throw new NotFoundException('User has no Telegram ID');
    }

    // Проверяем негативный кэш (Telegram-юзер не найден)
    const notFoundAt = avatarNotFoundCache.get(user.telegramId);
    if (notFoundAt && Date.now() - notFoundAt < AVATAR_NOT_FOUND_TTL_MS) {
      throw new NotFoundException('Avatar not available');
    }

    // Проверяем позитивный кэш
    const cached = avatarCache.get(user.telegramId);
    if (cached && Date.now() - cached.cachedAt < AVATAR_CACHE_TTL_MS) {
      res.set('Content-Type', cached.contentType);
      res.set('Cache-Control', 'public, max-age=3600');
      return res.send(cached.buffer);
    }

    const tg = this.telegramBot.getTelegramApi();
    if (!tg) {
      throw new NotFoundException('Bot is not running');
    }

    try {
      const photos = await tg.getUserProfilePhotos(Number(user.telegramId), 0, 1);
      if (!photos || photos.total_count === 0) {
        throw new NotFoundException('No avatar');
      }

      const photo = photos.photos[0];
      const fileId = photo[photo.length - 1].file_id; // последний = самый большой
      const fileLink = await tg.getFileLink(fileId);
      const response = await fetch(fileLink.toString());

      if (!response.ok) {
        throw new NotFoundException('Failed to fetch avatar');
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || 'image/jpeg';

      // Сохраняем в кэш
      avatarCache.set(user.telegramId, { buffer, contentType, cachedAt: Date.now() });

      res.set('Content-Type', contentType);
      res.set('Cache-Control', 'public, max-age=3600');
      return res.send(buffer);
    } catch (err: any) {
      if (err instanceof NotFoundException) throw err;

      // Если Telegram вернул «user not found», кэшируем на 24ч чтобы не спамить API
      const msg: string = err.message ?? '';
      if (msg.includes('user not found') || msg.includes('chat not found')) {
        avatarNotFoundCache.set(user.telegramId, Date.now());
      }

      this.logger.warn(`Failed to get avatar for user ${params.id}: ${msg}`);
      throw new NotFoundException('Avatar not available');
    }
  }
}
