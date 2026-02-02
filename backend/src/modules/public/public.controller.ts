import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BotService } from '../bot/bot.service';

@Controller('public')
export class PublicController {
  constructor(
    private readonly botService: BotService,
    private readonly config: ConfigService,
  ) {}

  @Get('meta')
  async meta() {
    const bot = await this.botService.getBotMe();

    return {
      botName: bot.name,
      botUsername: bot.username ?? null,
      companyName: this.config.get<string>('PUBLIC_COMPANY_NAME') ?? null,
      supportEmail: this.config.get<string>('PUBLIC_SUPPORT_EMAIL') ?? null,
      supportTelegram: this.config.get<string>('PUBLIC_SUPPORT_TELEGRAM') ?? null,
      siteUrl: this.config.get<string>('PUBLIC_SITE_URL') ?? null,
      updatedAt: new Date().toISOString(),
    };
  }
}

