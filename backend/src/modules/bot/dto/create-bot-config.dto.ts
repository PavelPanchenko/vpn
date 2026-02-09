import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethodDto } from './payment-method.dto';

export class CreateBotConfigDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @ValidateNested({ each: true })
  @Type(() => PaymentMethodDto)
  @IsOptional()
  paymentMethods?: PaymentMethodDto[];

  // CryptoCloud
  @IsString() @IsOptional() cryptocloudApiKey?: string;
  @IsString() @IsOptional() cryptocloudShopId?: string;
  @IsString() @IsOptional() cryptocloudSecretKey?: string;

  // Platega
  @IsString() @IsOptional() plategaMerchantId?: string;
  @IsString() @IsOptional() plategaSecret?: string;
  @IsInt() @Min(0) @IsOptional() @Type(() => Number) plategaPaymentMethod?: number;
  @IsString() @IsOptional() plategaReturnUrl?: string;
  @IsString() @IsOptional() plategaFailedUrl?: string;

  // Контакты
  @IsString() @IsOptional() publicSiteUrl?: string;
  @IsString() @IsOptional() publicSupportTelegram?: string;
  @IsString() @IsOptional() publicSupportEmail?: string;
  @IsString() @IsOptional() publicCompanyName?: string;

  // Лимиты
  @IsInt() @Min(0) @IsOptional() @Type(() => Number) panelClientLimitIp?: number;

  // Mini App
  @IsString() @IsOptional() telegramMiniAppUrl?: string;
}
