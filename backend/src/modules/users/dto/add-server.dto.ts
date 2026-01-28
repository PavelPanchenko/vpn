import { IsString } from 'class-validator';

export class AddServerDto {
  @IsString()
  serverId!: string;
}
