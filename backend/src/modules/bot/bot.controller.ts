import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { BotService } from './bot.service';
import { CreateBotConfigDto } from './dto/create-bot-config.dto';
import { UpdateBotConfigDto } from './dto/update-bot-config.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('bot')
@UseGuards(JwtAuthGuard)
export class BotController {
  constructor(private readonly botService: BotService) {}

  @Get()
  get() {
    return this.botService.get();
  }

  @Post()
  create(@Body() dto: CreateBotConfigDto) {
    return this.botService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBotConfigDto) {
    return this.botService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.botService.remove(id);
  }
}
