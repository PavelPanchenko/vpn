import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AdminAuth } from '../../common/guards/admin-auth.decorator';
import { IdParamDto } from '../../common/dto/id-param.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
@AdminAuth()
export class SubscriptionsController {
  constructor(private readonly subs: SubscriptionsService) {}

  @Get()
  list(@Query() q: PaginationQueryDto & { vpnUserId?: string; active?: string }) {
    return this.subs.list({
      offset: q.offset,
      limit: q.limit,
      vpnUserId: q.vpnUserId,
      active: q.active,
    });
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

