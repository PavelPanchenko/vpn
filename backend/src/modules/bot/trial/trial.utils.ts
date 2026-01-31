import type { PlansService } from '../../plans/plans.service';
import type { PlanLike } from '../bot-domain.types';

export function getTrialDaysFromPlans(plans: PlanLike[]): number {
  const trialPlan = plans?.find((p) => p?.isTrial);
  const n = Number(trialPlan?.periodDays);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

export async function getTrialDaysForUser(userId: string, plansService: PlansService): Promise<number> {
  try {
    const plans = (await plansService.list(userId)) as PlanLike[];
    return getTrialDaysFromPlans(plans);
  } catch {
    return 3;
  }
}

