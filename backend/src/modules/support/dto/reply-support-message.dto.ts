import { IsString, IsNotEmpty } from 'class-validator';

export class ReplySupportMessageDto {
  @IsString()
  @IsNotEmpty()
  message!: string;
}
