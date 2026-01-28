import { IsBoolean, IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  periodDays?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

