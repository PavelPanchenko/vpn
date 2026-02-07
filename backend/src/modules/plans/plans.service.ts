import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { defaultProviderForCurrency, defaultVariantCode, normalizeCurrency } from './plan-variant.utils';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Возвращает тарифы с учетом типа пользователя (новый/существующий)
   * @param userId - опциональный ID пользователя для фильтрации тарифов
   * Если userId не передан - возвращает все активные тарифы (для админки)
   */
  async list(userId?: string) {
    const where: any = { active: true };

    // Если userId не передан - возвращаем все активные тарифы (для админки)
    if (!userId) {
      return this.prisma.plan.findMany({
        where,
        include: { variants: { orderBy: { price: 'asc' } } },
        orderBy: [{ isTrial: 'desc' }, { periodDays: 'asc' }, { createdAt: 'asc' }],
      });
    }

    // Если userId передан - фильтруем по типу пользователя
    const user = await this.prisma.vpnUser.findUnique({
      where: { id: userId },
      select: { firstPaidAt: true },
    });

    const isExistingUser = user?.firstPaidAt !== null;

    // Логика видимости тарифов:
    // - Новые пользователи (firstPaidAt IS NULL): доступность определяется availableFor IN ("ALL", "NEW_USERS")
    // - Существующие пользователи (firstPaidAt IS NOT NULL): доступность определяется availableFor IN ("ALL", "EXISTING_USERS")
    // NOTE: видимость тарифов контролируется только availableFor (legacy удалён)
    // Trial не показываем в списке — он выдаётся автоматически при первом подключении
    where.isTrial = false;

    if (isExistingUser) {
      where.availableFor = { in: ['ALL', 'EXISTING_USERS'] };
    } else {
      where.availableFor = { in: ['ALL', 'NEW_USERS'] };
    }

    let result = await this.prisma.plan.findMany({
      where,
      include: { variants: { where: { active: true }, orderBy: { price: 'asc' } } },
      orderBy: [{ periodDays: 'asc' }, { createdAt: 'asc' }],
    });

    // Fallback: если для пользователя ничего не подошло — показываем все активные нетриальные (чтобы в Mini App всегда было что выбрать)
    if (result.length === 0) {
      result = await this.prisma.plan.findMany({
        where: { active: true, isTrial: false },
        include: { variants: { where: { active: true }, orderBy: { price: 'asc' } } },
        orderBy: [{ periodDays: 'asc' }, { createdAt: 'asc' }],
      });
    }

    return result;
  }

  async get(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async create(dto: CreatePlanDto) {
    if (dto.isTop) {
      await this.prisma.plan.updateMany({ data: { isTop: false } });
    }
    if (!dto.variants || dto.variants.length === 0) {
      throw new Error('Plan variants are required');
    }

    const variants = dto.variants.map((v) => {
      const currency = normalizeCurrency(v.currency);
      const code = String(v.code ?? '').trim() || defaultVariantCode(dto.code, currency);
      if (!code) throw new Error('Plan variant code is required');
      return {
        code,
        currency,
        price: v.price,
        provider: v.provider ?? defaultProviderForCurrency(currency),
        active: v.active ?? true,
      };
    });

    const created = await this.prisma.plan.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        periodDays: dto.periodDays,
        isTrial: dto.isTrial ?? false,
        active: dto.active ?? true,
        availableFor: dto.availableFor ?? 'ALL',
        isTop: dto.isTop ?? false,
        variants: { create: variants },
      },
      include: { variants: { orderBy: { price: 'asc' } } },
    });
    return created;
  }

  async update(id: string, dto: UpdatePlanDto) {
    await this.get(id);
    if (dto.isTop === true) {
      await this.prisma.plan.updateMany({ where: { id: { not: id } }, data: { isTop: false } });
    }
    return this.prisma.plan.update({
      where: { id },
      data: dto,
      include: { variants: { orderBy: { price: 'asc' } } },
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.plan.delete({ where: { id } });
    return { ok: true };
  }
}

