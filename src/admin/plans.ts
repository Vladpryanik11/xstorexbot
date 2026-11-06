import type { PlanAdminView } from '../domain/admin.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { writeAdminLog } from './log.js';

type PlanRow = {
  id: number;
  days: number;
  priceRub: number;
  priceStars: number | null;
  enabled: boolean;
};

function toAdminView(p: PlanRow): PlanAdminView {
  return {
    id: p.id,
    days: p.days,
    priceRub: p.priceRub,
    priceStars: p.priceStars,
    enabled: p.enabled,
  };
}

export async function listAllPlans(prisma: PrismaClient): Promise<PlanAdminView[]> {
  const plans = await prisma.plan.findMany({ orderBy: { sort: 'asc' } });
  return plans.map(toAdminView);
}

export async function getPlan(prisma: PrismaClient, id: number): Promise<PlanAdminView | null> {
  const plan = await prisma.plan.findUnique({ where: { id } });
  return plan ? toAdminView(plan) : null;
}

export async function setPlanPriceRub(
  prisma: PrismaClient,
  adminId: number,
  planId: number,
  kopecks: number,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const old = await tx.plan.findUniqueOrThrow({ where: { id: planId } });
    await tx.plan.update({ where: { id: planId }, data: { priceRub: kopecks } });
    await writeAdminLog(tx, {
      adminId,
      action: 'plan.price_rub',
      details: { planId, old: old.priceRub, new: kopecks },
    });
  });
}

export async function setPlanPriceStars(
  prisma: PrismaClient,
  adminId: number,
  planId: number,
  stars: number | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const old = await tx.plan.findUniqueOrThrow({ where: { id: planId } });
    await tx.plan.update({ where: { id: planId }, data: { priceStars: stars } });
    await writeAdminLog(tx, {
      adminId,
      action: 'plan.price_stars',
      details: { planId, old: old.priceStars, new: stars },
    });
  });
}

export async function setPlanEnabled(
  prisma: PrismaClient,
  adminId: number,
  planId: number,
  enabled: boolean,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.plan.update({ where: { id: planId }, data: { enabled } });
    await writeAdminLog(tx, { adminId, action: 'plan.enabled', details: { planId, enabled } });
  });
}
