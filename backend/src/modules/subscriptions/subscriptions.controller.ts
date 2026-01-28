import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AdminAuth } from '../../common/guards/admin-auth.decorator';
import { IdParamDto } from '../../common/dto/id-param.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
@AdminAuth()
export class SubscriptionsController {
  constructor(private readonly subs: SubscriptionsService) {}

  @Get()
  list() {
    return this.subs.list();
  }

  @Get(':id')
  get(@Param() params: IdParamDto) {
    return this.subs.get(params.id);
  }

  @Post()
  create(@Body() dto: CreateSubscriptionDto) {
    return this.subs.create(dto);
  }

  @Patch(':id')
  update(@Param() params: IdParamDto, @Body() dto: UpdateSubscriptionDto) {
    return this.subs.update(params.id, dto);
  }

  @Delete(':id')
  remove(@Param() params: IdParamDto) {
    return this.subs.remove(params.id);
  }
}

