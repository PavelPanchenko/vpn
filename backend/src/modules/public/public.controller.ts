import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BotService } from '../bot/bot.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('public')
export class PublicController {
  constructor(
    private readonly botService: BotService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('meta')
  async meta() {
    const bot = await this.botService.getBotMe();
    const cfg = await this.prisma.botConfig.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const paymentMethods = cfg?.id
      ? await (this.prisma as any).botPaymentMethod.findMany({
          where: { botConfigId: cfg.id },
          orderBy: { key: 'asc' },
          select: { key: true, enabled: true, allowedLangs: true },
        })
      : [];

    return {
      botName: bot.name,
      botUsername: bot.username ?? null,
      companyName: this.config.get<string>('PUBLIC_COMPANY_NAME') ?? null,
      supportEmail: this.config.get<string>('PUBLIC_SUPPORT_EMAIL') ?? null,
      supportTelegram: this.config.get<string>('PUBLIC_SUPPORT_TELEGRAM') ?? null,
      siteUrl: this.config.get<string>('PUBLIC_SITE_URL') ?? null,
      paymentMethods,
      updatedAt: new Date().toISOString(),
    };
  }
}

