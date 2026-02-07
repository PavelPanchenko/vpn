import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AdminAuth } from '../../common/guards/admin-auth.decorator';
import { IdParamDto } from '../../common/dto/id-param.dto';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { CreatePlanVariantDto } from './dto/create-plan-variant.dto';
import { UpdatePlanVariantDto } from './dto/update-plan-variant.dto';
import { PrismaService } from '../prisma/prisma.service';
import { defaultProviderForCurrency, defaultVariantCode, normalizeCurrency } from './plan-variant.utils';

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
    const currency = normalizeCurrency(dto.currency);
    const provider = dto.provider ?? defaultProviderForCurrency(currency);

    // Prevent duplicate currency within a plan (better UX than Prisma error)
    const existingCurrency = await this.prisma.planVariant.findFirst({
      where: { planId: plan.id, currency },
      select: { id: true },
    });
    if (existingCurrency) {
      throw new BadRequestException(`Variant for currency ${currency} already exists for this plan`);
    }

    const requestedCode = String(dto.code ?? '').trim();
    const base = requestedCode || defaultVariantCode(plan.code, currency);
    if (!base) throw new BadRequestException('Variant code is required');

    let code = base;
    for (let i = 0; i < 20; i++) {
      const exists = await this.prisma.planVariant.findUnique({ where: { code }, select: { id: true } });
      if (!exists) break;
      code = `${base}_${i + 2}`;
    }
    const stillExists = await this.prisma.planVariant.findUnique({ where: { code }, select: { id: true } });
    if (stillExists) throw new BadRequestException('Failed to allocate unique variant code');

    await this.prisma.planVariant.create({
      data: {
        planId: plan.id,
        code,
        currency,
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

