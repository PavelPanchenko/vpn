import type { Logger } from '@nestjs/common';
import type { PlansService } from '../../plans/plans.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PlanLike } from '../bot-domain.types';

export async function getPaidPlansWithFallback(args: {
  userId: string;
  plansService: PlansService;
  prisma: PrismaService;
  logger?: Logger;
  logContext?: string;
}): Promise<{ plans: PlanLike[]; basePlans: PlanLike[]; usedFallback: boolean }> {
  const basePlans = (await args.plansService.list(args.userId)) as PlanLike[];
  let paidPlans = basePlans.filter((p) => !p.isTrial && p.active);
  let usedFallback = false;

  if (paidPlans.length === 0) {
    usedFallback = true;
    if (args.logger) {
      const ctx = args.logContext ? ` (${args.logContext})` : '';
      args.logger.warn(`No paid plans available for user ${args.userId}${ctx}, trying to show all active plans`);
    }
    paidPlans = await args.prisma.plan.findMany({
      where: { active: true, isTrial: false },
      orderBy: { price: 'asc' },
    });
  }

  return { plans: paidPlans as PlanLike[], basePlans, usedFallback };
}

