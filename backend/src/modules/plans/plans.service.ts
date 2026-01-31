import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

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
        orderBy: { price: 'asc' },
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
    // NOTE: поле legacy — это метка для админки/миграции цен, но не должно само по себе скрывать тариф у новых пользователей
    // Trial не показываем в списке — он выдаётся автоматически при первом подключении
    where.isTrial = false;

    if (isExistingUser) {
      where.availableFor = { in: ['ALL', 'EXISTING_USERS'] };
    } else {
      where.availableFor = { in: ['ALL', 'NEW_USERS'] };
    }

    let result = await this.prisma.plan.findMany({
      where,
      orderBy: { price: 'asc' },
    });

    // Fallback: если для пользователя ничего не подошло — показываем все активные нетриальные (чтобы в Mini App всегда было что выбрать)
    if (result.length === 0) {
      result = await this.prisma.plan.findMany({
        where: { active: true, isTrial: false },
        orderBy: { price: 'asc' },
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
    return this.prisma.plan.create({ data: dto });
  }

  async update(id: string, dto: UpdatePlanDto) {
    await this.get(id);
    if (dto.isTop === true) {
      await this.prisma.plan.updateMany({ where: { id: { not: id } }, data: { isTop: false } });
    }
    return this.prisma.plan.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.plan.delete({ where: { id } });
    return { ok: true };
  }
}

