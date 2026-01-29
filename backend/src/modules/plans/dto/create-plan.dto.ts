import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreatePlanDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(1)
  @Max(3650)
  periodDays!: number;

  @IsInt()
  @Min(0)
  price!: number;

  @IsString()
  currency!: string;

  @IsOptional()
  @IsBoolean()
  isTrial?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  legacy?: boolean; // Старые тарифы для существующих пользователей

  @IsOptional()
  @IsIn(['ALL', 'NEW_USERS', 'EXISTING_USERS'])
  availableFor?: string; // Для кого доступен тариф

  @IsOptional()
  @IsBoolean()
  isTop?: boolean; // Подсветка «Топ тариф» в Mini App
}

