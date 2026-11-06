import type { PlanView } from '../domain/plans.js';
import type { PrismaClient } from '../generated/prisma/client.js';

type PlanRow = { id: number; days: number; priceRub: number; priceStars: number | null };

function toView(p: PlanRow): PlanView {
  return { id: p.id, days: p.days, priceRub: p.priceRub, priceStars: p.priceStars };
}

export async function listEnabledPlans(prisma: PrismaClient): Promise<PlanView[]> {
  const plans = await prisma.plan.findMany({ where: { enabled: true }, orderBy: { sort: 'asc' } });
  return plans.map(toView);
}

export async function getEnabledPlan(prisma: PrismaClient, id: number): Promise<PlanView | null> {
  const plan = await prisma.plan.findFirst({ where: { id, enabled: true } });
  return plan ? toView(plan) : null;
}
