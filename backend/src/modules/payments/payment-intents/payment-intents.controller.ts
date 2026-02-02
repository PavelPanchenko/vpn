import { Controller, Get, Param } from '@nestjs/common';
import { AdminAuth } from '../../../common/guards/admin-auth.decorator';
import { IdParamDto } from '../../../common/dto/id-param.dto';
import { PaymentIntentsService } from './payment-intents.service';

@Controller('payment-intents')
@AdminAuth()
export class PaymentIntentsController {
  constructor(private readonly intents: PaymentIntentsService) {}

  @Get()
  list() {
    return this.intents.listAdmin();
  }

  @Get(':id')
  get(@Param() params: IdParamDto) {
    return this.intents.getAdmin(params.id);
  }
}

