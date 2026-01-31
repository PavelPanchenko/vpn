import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { CreatePlanVariantDto } from './create-plan-variant.dto';

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

  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePlanVariantDto)
  variants!: CreatePlanVariantDto[];

  @IsOptional()
  @IsBoolean()
  isTrial?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsIn(['ALL', 'NEW_USERS', 'EXISTING_USERS'])
  availableFor?: string; // Для кого доступен тариф

  @IsOptional()
  @IsBoolean()
  isTop?: boolean; // Подсветка «Топ тариф» в Mini App
}

