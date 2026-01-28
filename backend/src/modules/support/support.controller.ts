import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SupportService } from './support.service';
import { CreateSupportMessageDto } from './dto/create-support-message.dto';
import { UpdateSupportMessageDto } from './dto/update-support-message.dto';
import { ReplySupportMessageDto } from './dto/reply-support-message.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SupportTicketStatus } from '@prisma/client';

@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get()
  findAll(
    @Query('status') status?: SupportTicketStatus,
    @Query('vpnUserId') vpnUserId?: string,
  ) {
    return this.supportService.findAll({ status, vpnUserId });
  }

  @Get('stats')
  async getStats() {
    const openTickets = await this.supportService.getOpenTicketsCount();
    return { openTickets };
  }

  @Get('user/:vpnUserId')
  findByUserId(@Param('vpnUserId') vpnUserId: string) {
    return this.supportService.findByUserId(vpnUserId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.supportService.findOne(id);
  }

  @Post()
  create(@Body() createSupportMessageDto: CreateSupportMessageDto) {
    return this.supportService.create(createSupportMessageDto);
  }

  @Post(':id/reply')
  reply(
    @Param('id') id: string,
    @Body() replyDto: ReplySupportMessageDto,
  ) {
    return this.supportService.reply(id, replyDto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateSupportMessageDto: UpdateSupportMessageDto,
  ) {
    return this.supportService.update(id, updateSupportMessageDto);
  }

  @Patch('user/:vpnUserId/close')
  closeTicket(@Param('vpnUserId') vpnUserId: string) {
    return this.supportService.closeTicket(vpnUserId);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.supportService.remove(id);
  }
}
