import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { SupportMessageType, SupportTicketStatus } from '@prisma/client';

export class CreateSupportMessageDto {
  @IsString()
  @IsNotEmpty()
  vpnUserId!: string;

  @IsEnum(SupportMessageType)
  type!: SupportMessageType;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsEnum(SupportTicketStatus)
  @IsOptional()
  status?: SupportTicketStatus;
}
