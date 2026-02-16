import { Body, Controller, Post } from '@nestjs/common';
import { AdminAuth } from '../../common/guards/admin-auth.decorator';
import { BroadcastAudience, BroadcastService } from './broadcast.service';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

class BroadcastPreviewDto {
  @IsEnum(BroadcastAudience)
  audience!: BroadcastAudience;
}

class BroadcastSendDto {
  @IsEnum(BroadcastAudience)
  audience!: BroadcastAudience;

  @IsString()
  @IsNotEmpty()
  message!: string;
}

@Controller('broadcast')
@AdminAuth()
export class BroadcastController {
  constructor(private readonly broadcast: BroadcastService) {}

  /** Возвращает количество получателей для сегмента. */
  @Post('preview')
  async preview(@Body() dto: BroadcastPreviewDto) {
    const count = await this.broadcast.countByAudience(dto.audience);
    return { count };
  }

  /** Отправляет рассылку и возвращает статистику. */
  @Post('send')
  async send(@Body() dto: BroadcastSendDto) {
    return this.broadcast.sendBroadcast(dto.audience, dto.message);
  }
}
