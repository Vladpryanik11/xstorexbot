import type { PlanView } from '../domain/plans.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { getEnabledPlan, listEnabledPlans } from './plans.js';
import { getActiveUntil } from './subscriptions.js';
import { type TelegramFrom, touchUser } from './users.js';

export type { TelegramFrom };

export interface Services {
  touchUser(from: TelegramFrom): Promise<void>;
  /** endsAt, если endsAt > now, иначе null. */
  getActiveUntil(userId: number, now: Date): Promise<Date | null>;
  listEnabledPlans(): Promise<PlanView[]>;
  getEnabledPlan(id: number): Promise<PlanView | null>;
}

export function createServices(prisma: PrismaClient): Services {
  return {
    touchUser: (from) => touchUser(prisma, from),
    getActiveUntil: (userId, now) => getActiveUntil(prisma, userId, now),
    listEnabledPlans: () => listEnabledPlans(prisma),
    getEnabledPlan: (id) => getEnabledPlan(prisma, id),
  };
}
