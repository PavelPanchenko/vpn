import { BadRequestException, Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PlategaCallbackPayload } from './platega-api';
import { PaymentIntentsService } from '../payment-intents/payment-intents.service';

@Controller('payments/platega')
export class PlategaController {
  constructor(
    private readonly intents: PaymentIntentsService,
    private readonly config: ConfigService,
  ) {}

  @Post('webhook')
  async webhook(
    @Headers('x-merchantid') merchantIdHeader: string | undefined,
    @Headers('x-secret') secretHeader: string | undefined,
    @Body() body: PlategaCallbackPayload,
  ) {
    const merchantId = this.config.get<string>('PLATEGA_MERCHANT_ID') || '';
    const secret = this.config.get<string>('PLATEGA_SECRET') || '';
    if (!merchantId || !secret) throw new BadRequestException('Platega is not configured');

    if (!merchantIdHeader || !secretHeader) throw new UnauthorizedException('Missing Platega auth headers');
    if (String(merchantIdHeader) !== merchantId || String(secretHeader) !== secret) {
      throw new UnauthorizedException('Invalid Platega auth headers');
    }

    if (!body?.id) throw new BadRequestException('Missing transaction id');

    await this.intents.handlePlategaWebhook({
      transactionId: String(body.id),
      callbackStatus: body.status,
      callbackAmount: Number(body.amount),
      callbackCurrency: String(body.currency),
    });

    return { ok: true };
  }
}

