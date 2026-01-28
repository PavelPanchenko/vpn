import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateBotConfigDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsBoolean()
  @IsOptional()
  useMiniApp?: boolean;
}
