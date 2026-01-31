import { IsIn, IsOptional, IsString } from 'class-validator';
import { MiniInitDataDto } from './mini-auth.dto';

export class MiniPayDto extends MiniInitDataDto {
  @IsString()
  planId!: string;

  @IsOptional()
  @IsIn(['TELEGRAM_STARS', 'EXTERNAL_URL'])
  provider?: 'TELEGRAM_STARS' | 'EXTERNAL_URL';
}

