import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class CreateBotConfigDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsBoolean()
  active?: boolean;
}
