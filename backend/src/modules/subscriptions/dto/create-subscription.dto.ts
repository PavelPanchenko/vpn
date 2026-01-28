import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateSubscriptionDto {
  @IsString()
  vpnUserId!: string;

  @IsOptional()
  @IsString()
  paymentId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  periodDays?: number;

  @IsOptional()
  @IsString()
  planId?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;
}

