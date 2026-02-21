import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class MigratePanelEmailsDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  limit?: number | null;
}
