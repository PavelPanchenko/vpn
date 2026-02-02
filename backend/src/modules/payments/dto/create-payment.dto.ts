import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreatePaymentDto {
  @IsString()
  vpnUserId!: string;

  @IsOptional()
  @IsString()
  planId?: string;

  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  amount!: number;

  @IsString()
  currency!: string;

  @IsIn(['PENDING', 'PAID', 'FAILED', 'CANCELED', 'CHARGEBACK'])
  status!: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELED' | 'CHARGEBACK';
}

