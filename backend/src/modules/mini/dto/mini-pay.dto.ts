import { IsIn, IsOptional, IsString } from 'class-validator';
import { MiniInitDataDto } from './mini-auth.dto';

export class MiniPayDto extends MiniInitDataDto {
  @IsString()
  variantId!: string;

  @IsOptional()
  @IsIn(['TELEGRAM_STARS', 'PLATEGA', 'CRYPTOCLOUD'])
  provider?: 'TELEGRAM_STARS' | 'PLATEGA' | 'CRYPTOCLOUD';
}

