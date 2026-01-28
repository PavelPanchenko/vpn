import { IsString } from 'class-validator';
import { MiniInitDataDto } from './mini-auth.dto';

export class MiniActivateServerDto extends MiniInitDataDto {
  @IsString()
  serverId!: string;
}

