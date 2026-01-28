import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  serverId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  telegramId?: string | null;

  @IsOptional()
  @IsIn(['ACTIVE', 'BLOCKED', 'EXPIRED'])
  status?: 'ACTIVE' | 'BLOCKED' | 'EXPIRED';

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  trialDays?: number;
}

