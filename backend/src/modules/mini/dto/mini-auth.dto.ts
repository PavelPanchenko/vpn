import { IsString } from 'class-validator';

export class MiniInitDataDto {
  @IsString()
  initData!: string;
}

