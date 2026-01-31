import type { PlansService } from '../../plans/plans.service';

export function getTrialDaysFromPlans(plans: any[]): number {
  const trialPlan = plans?.find((p: any) => p?.isTrial);
  const n = Number(trialPlan?.periodDays);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

export async function getTrialDaysForUser(userId: string, plansService: PlansService): Promise<number> {
  try {
    const plans = await plansService.list(userId);
    return getTrialDaysFromPlans(plans);
  } catch {
    return 3;
  }
}

