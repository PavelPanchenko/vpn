import { ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export const PAYMENT_METHOD_KEYS = ['TELEGRAM_STARS', 'PLATEGA', 'CRYPTOCLOUD'] as const;
export type PaymentMethodKey = (typeof PAYMENT_METHOD_KEYS)[number];

export class PaymentMethodDto {
  @IsString()
  @IsIn(PAYMENT_METHOD_KEYS as unknown as string[])
  key!: PaymentMethodKey;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsArray()
  @IsOptional()
  @ArrayUnique()
  @IsIn(['ru', 'en', 'uk'], { each: true })
  allowedLangs?: string[];
}

