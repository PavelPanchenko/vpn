import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class MigratePanelEmailsDto {
  /** Если true — ничего не меняем, только показываем что было бы сделано. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  dryRun?: boolean;

  /** Ограничить количество записей для обработки (для безопасного прогрева). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

