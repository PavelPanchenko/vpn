import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Inject,
  Optional,
  Post,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PlategaCallbackPayload } from './platega-api';
import { PaymentIntentsService } from '../payment-intents/payment-intents.service';
import { TelegramBotService } from '../../bot/telegram-bot.service';

function assertPlategaAuth(args: {
  config: ConfigService;
  merchantIdHeader: string | undefined;
  secretHeader: string | undefined;
}) {
  const merchantId = args.config.get<string>('PLATEGA_MERCHANT_ID') || '';
  const secret = args.config.get<string>('PLATEGA_SECRET') || '';
  if (!merchantId || !secret) throw new BadRequestException('Platega is not configured');

  if (!args.merchantIdHeader || !args.secretHeader) throw new UnauthorizedException('Missing Platega auth headers');
  if (String(args.merchantIdHeader) !== merchantId || String(args.secretHeader) !== secret) {
    throw new UnauthorizedException('Invalid Platega auth headers');
  }
}

async function handlePlategaCallback(args: {
  intents: PaymentIntentsService;
  config: ConfigService;
  merchantIdHeader: string | undefined;
  secretHeader: string | undefined;
  body: PlategaCallbackPayload;
}): Promise<{ ok: true; telegramId?: string }> {
  assertPlategaAuth({
    config: args.config,
    merchantIdHeader: args.merchantIdHeader,
    secretHeader: args.secretHeader,
  });
  if (!args.body?.id) throw new BadRequestException('Missing transaction id');

  const result = await args.intents.handlePlategaWebhook({
    transactionId: String(args.body.id),
    callbackStatus: args.body.status,
    callbackAmount: Number(args.body.amount),
    callbackCurrency: String(args.body.currency),
  });

  return { ok: true, telegramId: result.telegramId };
}

@Controller('payments/platega')
export class PlategaController {
  constructor(
    private readonly intents: PaymentIntentsService,
    private readonly config: ConfigService,
    @Optional()
    @Inject(forwardRef(() => TelegramBotService))
    private readonly telegramBot: TelegramBotService | null,
  ) {}

  @Post('webhook')
  async webhook(
    @Headers('x-merchantid') merchantIdHeader: string | undefined,
    @Headers('x-secret') secretHeader: string | undefined,
    @Body() body: PlategaCallbackPayload,
  ) {
    const result = await handlePlategaCallback({
      intents: this.intents,
      config: this.config,
      merchantIdHeader,
      secretHeader,
      body,
    });
    if (result.telegramId && this.telegramBot) {
      await this.telegramBot.sendPaymentSuccessNotification(result.telegramId).catch(() => {});
    }
    return { ok: true };
  }

  // Docs default callback endpoint name
  @Post('paymentStatus')
  async paymentStatus(
    @Headers('x-merchantid') merchantIdHeader: string | undefined,
    @Headers('x-secret') secretHeader: string | undefined,
    @Body() body: PlategaCallbackPayload,
  ) {
    const result = await handlePlategaCallback({
      intents: this.intents,
      config: this.config,
      merchantIdHeader,
      secretHeader,
      body,
    });
    if (result.telegramId && this.telegramBot) {
      await this.telegramBot.sendPaymentSuccessNotification(result.telegramId).catch(() => {});
    }
    return { ok: true };
  }
}

// If merchant dashboard uses root callback path (`/paymentStatus`), support it too.
@Controller()
export class PlategaCallbackController {
  constructor(
    private readonly intents: PaymentIntentsService,
    private readonly config: ConfigService,
    @Optional()
    @Inject(forwardRef(() => TelegramBotService))
    private readonly telegramBot: TelegramBotService | null,
  ) {}

  @Post('paymentStatus')
  async paymentStatus(
    @Headers('x-merchantid') merchantIdHeader: string | undefined,
    @Headers('x-secret') secretHeader: string | undefined,
    @Body() body: PlategaCallbackPayload,
  ) {
    const result = await handlePlategaCallback({
      intents: this.intents,
      config: this.config,
      merchantIdHeader,
      secretHeader,
      body,
    });
    if (result.telegramId && this.telegramBot) {
      await this.telegramBot.sendPaymentSuccessNotification(result.telegramId).catch(() => {});
    }
    return { ok: true };
  }
}

