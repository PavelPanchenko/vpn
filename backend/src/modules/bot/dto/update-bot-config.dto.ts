import { PartialType } from '@nestjs/mapped-types';
import { CreateBotConfigDto } from './create-bot-config.dto';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateBotConfigDto extends PartialType(CreateBotConfigDto) {
  @IsString()
  @IsOptional()
  token?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
