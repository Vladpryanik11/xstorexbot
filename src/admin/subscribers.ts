import type { SubscriberCard, SubscriberQuery } from '../domain/admin.js';
import { extendEndsAt } from '../domain/subscription.js';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { writeAdminLog } from './log.js';

const CARD_PAYMENTS = 10;

export async function findUserId(
  prisma: PrismaClient,
  query: SubscriberQuery,
): Promise<number | null> {
  if ('id' in query) {
    const user = await prisma.user.findUnique({
      where: { id: BigInt(query.id) },
      select: { id: true },
    });
    return user ? Number(user.id) : null;
  }
  // lower("username") = lower(...) использует индекс User_username_lower_idx.
  const rows = await prisma.$queryRaw<{ id: bigint }[]>`
    SELECT "id" FROM "User" WHERE lower("username") = lower(${query.username}) LIMIT 1`;
  const row = rows[0];
  return row ? Number(row.id) : null;
}

export async function getSubscriberCard(
  prisma: PrismaClient,
  userId: number,
): Promise<SubscriberCard | null> {
  const user = await prisma.user.findUnique({
    where: { id: BigInt(userId) },
    include: {
      subscription: true,
      payments: { orderBy: { createdAt: 'desc' }, take: CARD_PAYMENTS },
    },
  });
  if (!user) return null;
  return {
    id: Number(user.id),
    firstName: user.firstName,
    username: user.username,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt,
    blockedAt: user.blockedAt,
    endsAt: user.subscription?.endsAt ?? null,
    payments: user.payments.map((p) => ({
      createdAt: p.createdAt,
      provider: p.provider,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
    })),
  };
}

/**
 * Блокирует строку пользователя (она есть всегда, в отличие от подписки) и затем читает подписку.
 * Так две параллельные админские операции над одним пользователем выполняются по очереди,
 * в том числе когда подписки ещё нет. Возвращает null, если пользователя или подписки нет.
 */
async function lockSubscription(
  tx: Prisma.TransactionClient,
  userId: number,
): Promise<{ endsAt: Date } | null> {
  const id = BigInt(userId);
  const users = await tx.$queryRaw<{ id: bigint }[]>`
    SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
  if (users.length === 0) return null;
  const subs = await tx.$queryRaw<{ endsAt: Date }[]>`
    SELECT "endsAt" FROM "Subscription" WHERE "userId" = ${id} FOR UPDATE`;
  return subs[0] ?? null;
}

async function userExists(tx: Prisma.TransactionClient, userId: number): Promise<boolean> {
  return (await tx.user.count({ where: { id: BigInt(userId) } })) > 0;
}

export async function addDays(
  prisma: PrismaClient,
  adminId: number,
  userId: number,
  days: number,
  now: Date,
): Promise<{ endsAt: Date; paymentId: string }> {
  return prisma.$transaction(async (tx) => {
    const current = await lockSubscription(tx, userId);
    if (!current && !(await userExists(tx, userId))) {
      throw new Error(`Пользователь ${userId} не найден`);
    }
    const oldEndsAt = current?.endsAt ?? null;
    const endsAt = extendEndsAt(oldEndsAt, now, days);
    const id = BigInt(userId);
    await tx.subscription.upsert({
      where: { userId: id },
      create: { userId: id, endsAt },
      update: {
        endsAt,
        reminded3dAt: null,
        reminded1dAt: null,
        removedAt: null,
        removeAttempts: 0,
      },
    });
    const payment = await tx.payment.create({
      data: {
        userId: id,
        planId: null,
        provider: 'MANUAL',
        days,
        amount: 0,
        currency: 'RUB',
        status: 'PAID',
        paidAt: now,
        appliedAt: now,
        createdByAdminId: BigInt(adminId),
      },
    });
    await writeAdminLog(tx, {
      adminId,
      action: 'subscription.add_days',
      targetUserId: userId,
      details: {
        days,
        oldEndsAt: oldEndsAt ? oldEndsAt.toISOString() : null,
        newEndsAt: endsAt.toISOString(),
        paymentId: payment.id,
      },
    });
    return { endsAt, paymentId: payment.id };
  });
}

export async function endSubscription(
  prisma: PrismaClient,
  adminId: number,
  userId: number,
  now: Date,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const current = await lockSubscription(tx, userId);
    if (!current || current.endsAt.getTime() <= now.getTime()) return false;
    await tx.subscription.update({ where: { userId: BigInt(userId) }, data: { endsAt: now } });
    await writeAdminLog(tx, {
      adminId,
      action: 'subscription.end',
      targetUserId: userId,
      details: { oldEndsAt: current.endsAt.toISOString() },
    });
    return true;
  });
}
