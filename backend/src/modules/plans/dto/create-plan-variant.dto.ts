import { IsBoolean, IsOptional, IsString, IsInt, Min } from 'class-validator';

export class CreatePlanVariantDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsString()
  currency!: string;

  @IsInt()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

