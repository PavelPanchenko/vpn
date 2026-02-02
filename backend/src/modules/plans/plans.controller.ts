import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AdminAuth } from '../../common/guards/admin-auth.decorator';
import { IdParamDto } from '../../common/dto/id-param.dto';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { CreatePlanVariantDto } from './dto/create-plan-variant.dto';
import { UpdatePlanVariantDto } from './dto/update-plan-variant.dto';
import { PrismaService } from '../prisma/prisma.service';

@Controller('plans')
@AdminAuth()
export class PlansController {
  constructor(
    private readonly plans: PlansService,
    private readonly prisma: PrismaService,
  ) {}

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

  @Post(':id/variants')
  async createVariant(@Param() params: IdParamDto, @Body() dto: CreatePlanVariantDto) {
    const plan = await this.plans.get(params.id);
    const provider = dto.provider ?? (dto.currency === 'XTR' ? 'TELEGRAM_STARS' : 'PLATEGA');
    await this.prisma.planVariant.create({
      data: {
        planId: plan.id,
        code: dto.code,
        currency: dto.currency,
        price: dto.price,
        provider,
        active: dto.active ?? true,
      },
    });
    return this.plans.get(params.id);
  }

  @Patch('variants/:id')
  async updateVariant(@Param() params: IdParamDto, @Body() dto: UpdatePlanVariantDto) {
    await this.prisma.planVariant.update({ where: { id: params.id }, data: dto });
    return { ok: true };
  }

  @Delete('variants/:id')
  async removeVariant(@Param() params: IdParamDto) {
    await this.prisma.planVariant.delete({ where: { id: params.id } });
    return { ok: true };
  }

  @Delete(':id')
  remove(@Param() params: IdParamDto) {
    return this.plans.remove(params.id);
  }
}

