import type { PrismaClient } from '../generated/prisma/client.js';

export async function getActiveUntil(
  prisma: PrismaClient,
  userId: number,
  now: Date,
): Promise<Date | null> {
  const sub = await prisma.subscription.findUnique({ where: { userId: BigInt(userId) } });
  return sub && sub.endsAt > now ? sub.endsAt : null;
}
