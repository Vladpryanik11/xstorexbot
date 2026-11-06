import type { BaseStats, PlanAdminView, SubscriberCard, SubscriberQuery } from '../domain/admin.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import {
  getPlan,
  listAllPlans,
  setPlanEnabled,
  setPlanPriceRub,
  setPlanPriceStars,
} from './plans.js';
import { baseStats } from './stats.js';
import { addDays, endSubscription, findUserId, getSubscriberCard } from './subscribers.js';

export { writeAdminLog } from './log.js';

export interface AdminServices {
  listAllPlans(): Promise<PlanAdminView[]>;
  getPlan(id: number): Promise<PlanAdminView | null>;
  setPlanPriceRub(adminId: number, planId: number, kopecks: number): Promise<void>;
  setPlanPriceStars(adminId: number, planId: number, stars: number | null): Promise<void>;
  setPlanEnabled(adminId: number, planId: number, enabled: boolean): Promise<void>;
  findUserId(query: SubscriberQuery): Promise<number | null>;
  getSubscriberCard(userId: number): Promise<SubscriberCard | null>;
  addDays(
    adminId: number,
    userId: number,
    days: number,
    now: Date,
  ): Promise<{ endsAt: Date; paymentId: string }>;
  /** false, если подписка не активна. */
  endSubscription(adminId: number, userId: number, now: Date): Promise<boolean>;
  baseStats(now: Date): Promise<BaseStats>;
}

export function createAdminServices(prisma: PrismaClient): AdminServices {
  return {
    listAllPlans: () => listAllPlans(prisma),
    getPlan: (id) => getPlan(prisma, id),
    setPlanPriceRub: (adminId, planId, kopecks) =>
      setPlanPriceRub(prisma, adminId, planId, kopecks),
    setPlanPriceStars: (adminId, planId, stars) =>
      setPlanPriceStars(prisma, adminId, planId, stars),
    setPlanEnabled: (adminId, planId, enabled) => setPlanEnabled(prisma, adminId, planId, enabled),
    findUserId: (query) => findUserId(prisma, query),
    getSubscriberCard: (userId) => getSubscriberCard(prisma, userId),
    addDays: (adminId, userId, days, now) => addDays(prisma, adminId, userId, days, now),
    endSubscription: (adminId, userId, now) => endSubscription(prisma, adminId, userId, now),
    baseStats: (now) => baseStats(prisma, now),
  };
}
