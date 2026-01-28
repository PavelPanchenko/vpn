import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AdminAuth } from '../../common/guards/admin-auth.decorator';
import { IdParamDto } from '../../common/dto/id-param.dto';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Controller('plans')
@AdminAuth()
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  list(@Query('userId') userId?: string) {
    return this.plans.list(userId);
  }

  @Get(':id')
  get(@Param() params: IdParamDto) {
    return this.plans.get(params.id);
  }

  @Post()
  create(@Body() dto: CreatePlanDto) {
    return this.plans.create(dto);
  }

  @Patch(':id')
  update(@Param() params: IdParamDto, @Body() dto: UpdatePlanDto) {
    return this.plans.update(params.id, dto);
  }

  @Delete(':id')
  remove(@Param() params: IdParamDto) {
    return this.plans.remove(params.id);
  }
}

