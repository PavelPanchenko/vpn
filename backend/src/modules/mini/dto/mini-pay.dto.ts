import { IsString } from 'class-validator';
import { MiniInitDataDto } from './mini-auth.dto';

export class MiniPayDto extends MiniInitDataDto {
  @IsString()
  planId!: string;
}

