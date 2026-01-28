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
    // - Новые пользователи (firstPaidAt IS NULL): только новые тарифы (legacy=false, availableFor IN ("ALL", "NEW_USERS"))
    // - Существующие пользователи (firstPaidAt IS NOT NULL): все тарифы (availableFor IN ("ALL", "EXISTING_USERS"), legacy может быть любым)
    if (isExistingUser) {
      where.availableFor = { in: ['ALL', 'EXISTING_USERS'] };
    } else {
      where.legacy = false;
      where.availableFor = { in: ['ALL', 'NEW_USERS'] };
    }

    return this.prisma.plan.findMany({
      where,
      orderBy: { price: 'asc' },
    });
  }

  async get(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  create(dto: CreatePlanDto) {
    return this.prisma.plan.create({ data: dto });
  }

  async update(id: string, dto: UpdatePlanDto) {
    await this.get(id);
    return this.prisma.plan.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.plan.delete({ where: { id } });
    return { ok: true };
  }
}

