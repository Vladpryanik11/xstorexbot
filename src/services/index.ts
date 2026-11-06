import type { PlanView } from '../domain/plans.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { getEnabledPlan, listEnabledPlans } from './plans.js';
import { getActiveUntil } from './subscriptions.js';
import { markBlocked, setBlocked, type TelegramFrom, touchUser } from './users.js';

export type { TelegramFrom };

export interface Services {
  touchUser(from: TelegramFrom, now: Date): Promise<void>;
  setBlocked(from: TelegramFrom, blockedAt: Date | null): Promise<void>;
  markBlocked(userId: number, now: Date): Promise<void>;
  /** endsAt, если endsAt > now, иначе null. */
  getActiveUntil(userId: number, now: Date): Promise<Date | null>;
  listEnabledPlans(): Promise<PlanView[]>;
  getEnabledPlan(id: number): Promise<PlanView | null>;
}

export function createServices(prisma: PrismaClient): Services {
  return {
    touchUser: (from, now) => touchUser(prisma, from, now),
    setBlocked: (from, blockedAt) => setBlocked(prisma, from, blockedAt),
    markBlocked: (userId, now) => markBlocked(prisma, userId, now),
    getActiveUntil: (userId, now) => getActiveUntil(prisma, userId, now),
    listEnabledPlans: () => listEnabledPlans(prisma),
    getEnabledPlan: (id) => getEnabledPlan(prisma, id),
  };
}
