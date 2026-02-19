import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  /** Опциональный поисковый запрос (name / telegramId). */
  @IsOptional()
  @IsString()
  q?: string;

  /** Поле сортировки: name, expiresAt, status, lastOnlineAt, createdAt, serverName */
  @IsOptional()
  @IsString()
  sortBy?: string;

  /** asc | desc */
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

  /** Вернуть только { count } (для страницы пользователей). */
  @IsOptional()
  @IsString()
  countOnly?: string;

  /** Скрыть пользователей, заблокировавших бота (по умолчанию 1). 0 или false — показать всех. */
  @IsOptional()
  @IsString()
  hideBlocked?: string;
}

