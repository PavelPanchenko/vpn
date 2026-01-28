import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AdminAuth } from '../../common/guards/admin-auth.decorator';
import { IdParamDto } from '../../common/dto/id-param.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
@AdminAuth()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  list() {
    return this.payments.list();
  }

  @Get(':id')
  get(@Param() params: IdParamDto) {
    return this.payments.get(params.id);
  }

  @Post()
  create(@Body() dto: CreatePaymentDto) {
    return this.payments.create(dto);
  }

  @Patch(':id')
  update(@Param() params: IdParamDto, @Body() dto: UpdatePaymentDto) {
    return this.payments.update(params.id, dto);
  }

  @Delete(':id')
  remove(@Param() params: IdParamDto) {
    return this.payments.remove(params.id);
  }
}

