import { BadRequestException, Body, Controller, Inject, Optional, Post, forwardRef } from '@nestjs/common';
import { PaymentIntentsService } from '../payment-intents/payment-intents.service';
import type { CryptoCloudPostbackBody } from './cryptocloud-postback';
import { verifyCryptoCloudPostbackToken } from './cryptocloud-postback';
import { TelegramBotService } from '../../bot/telegram-bot.service';
import { BotService } from '../../bot/bot.service';

@Controller('payments/cryptocloud')
export class CryptoCloudController {
  constructor(
    private readonly intents: PaymentIntentsService,
    @Inject(forwardRef(() => BotService))
    private readonly botService: BotService,
    @Optional()
    @Inject(forwardRef(() => TelegramBotService))
    private readonly telegramBot: TelegramBotService | null,
  ) {}

  @Post('postback')
  async postback(@Body() body: CryptoCloudPostbackBody) {
    return this.handle(body);
  }

  // alias (common name)
  @Post('webhook')
  async webhook(@Body() body: CryptoCloudPostbackBody) {
    return this.handle(body);
  }

  private async handle(body: CryptoCloudPostbackBody) {
    const secret = ((await this.botService.getCryptocloudSecretKey()) || '').trim();
    if (!secret) throw new BadRequestException('CryptoCloud is not configured (CRYPTOCLOUD_SECRET_KEY)');

    const token = String((body as any)?.token ?? '').trim();
    const verified = verifyCryptoCloudPostbackToken({ token, secret });
    if (!verified) throw new BadRequestException('Invalid CryptoCloud token');

    const result = await this.intents.handleCryptoCloudPostback({ body });
    if (result.telegramId && this.telegramBot) {
      await this.telegramBot.sendPaymentSuccessNotification(result.telegramId).catch(() => {});
    }
    return { ok: true };
  }
}

