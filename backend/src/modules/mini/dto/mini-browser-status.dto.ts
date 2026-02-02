import { IsString } from 'class-validator';

export class MiniBrowserStatusDto {
  @IsString()
  loginId!: string;
}

