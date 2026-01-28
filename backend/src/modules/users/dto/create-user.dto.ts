import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  serverId!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  telegramId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  trialDays?: number;
}

