import type { BaseStats } from '../domain/admin.js';
import type { PrismaClient } from '../generated/prisma/client.js';

export async function baseStats(prisma: PrismaClient, now: Date): Promise<BaseStats> {
  const [users, blocked, active] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { blockedAt: { not: null } } }),
    prisma.subscription.count({ where: { endsAt: { gt: now } } }),
  ]);
  return { users, reachable: users - blocked, blocked, active };
}
