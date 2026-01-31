import { IsBoolean, IsOptional, IsString, IsInt, Min } from 'class-validator';

export class UpdatePlanVariantDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

