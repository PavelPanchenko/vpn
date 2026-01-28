import { IsString, IsOptional, IsEnum } from 'class-validator';
import { SupportTicketStatus } from '@prisma/client';

export class UpdateSupportMessageDto {
  @IsString()
  @IsOptional()
  message?: string;

  @IsEnum(SupportTicketStatus)
  @IsOptional()
  status?: SupportTicketStatus;
}
