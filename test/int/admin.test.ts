import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createAdminServices } from '../../src/admin/index.js';
import { resetDb, testPrisma } from './helpers/db.js';

const prisma = testPrisma();
const admin = createAdminServices(prisma);

beforeEach(() => resetDb(prisma));
afterAll(() => prisma.$disconnect());

const now = new Date('2026-11-07T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const inDays = (n: number) => new Date(now.getTime() + n * DAY);

async function mkUser(id: number, extra: { username?: string; blockedAt?: Date } = {}) {
  await prisma.user.create({ data: { id: BigInt(id), firstName: `U${id}`, ...extra } });
}

describe('findUserId', () => {
  it('finds a user by username case-insensitively', async () => {
    await mkUser(5, { username: 'ivan' });
    expect(await admin.findUserId({ username: 'IVAN' })).toBe(5);
  });

  it('finds by id and returns null for unknown id or username', async () => {
    await mkUser(5, { username: 'ivan' });
    expect(await admin.findUserId({ id: 5 })).toBe(5);
    expect(await admin.findUserId({ id: 6 })).toBeNull();
    expect(await admin.findUserId({ username: 'nobody' })).toBeNull();
  });

  it('does not find a user without username by username', async () => {
    await mkUser(7);
    expect(await admin.findUserId({ username: 'U7' })).toBeNull();
  });
});

describe('addDays', () => {
  it('creates a subscription for a user without one', async () => {
    await mkUser(42);
    const res = await admin.addDays(1, 42, 10, now);
    expect(res.endsAt).toEqual(inDays(10));
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { userId: 42n } });
    expect(sub.endsAt).toEqual(inDays(10));
  });

  it('extends an active subscription from its end and resets reminders', async () => {
    await mkUser(42);
    await prisma.subscription.create({
      data: {
        userId: 42n,
        endsAt: inDays(5),
        reminded3dAt: now,
        reminded1dAt: now,
        removedAt: now,
        removeAttempts: 3,
      },
    });
    const res = await admin.addDays(1, 42, 10, now);
    expect(res.endsAt).toEqual(inDays(15));
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { userId: 42n } });
    expect(sub.endsAt).toEqual(inDays(15));
    expect(sub.reminded3dAt).toBeNull();
    expect(sub.reminded1dAt).toBeNull();
    expect(sub.removedAt).toBeNull();
    expect(sub.removeAttempts).toBe(0);
  });

  it('records a MANUAL payment and an admin log entry', async () => {
    await mkUser(42);
    await prisma.subscription.create({ data: { userId: 42n, endsAt: inDays(5) } });
    const res = await admin.addDays(1, 42, 10, now);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: res.paymentId } });
    expect(payment).toMatchObject({
      userId: 42n,
      planId: null,
      provider: 'MANUAL',
      days: 10,
      amount: 0,
      currency: 'RUB',
      status: 'PAID',
      createdByAdminId: 1n,
    });
    expect(payment.paidAt).toEqual(now);
    expect(payment.appliedAt).toEqual(now);

    const log = await prisma.adminLog.findMany();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      adminId: 1n,
      action: 'subscription.add_days',
      targetUserId: 42n,
      details: {
        days: 10,
        oldEndsAt: inDays(5).toISOString(),
        newEndsAt: inDays(15).toISOString(),
        paymentId: res.paymentId,
      },
    });
  });

  it('does not lose days on concurrent calls', async () => {
    await mkUser(42);
    await prisma.subscription.create({ data: { userId: 42n, endsAt: inDays(5) } });
    await Promise.all([admin.addDays(1, 42, 10, now), admin.addDays(1, 42, 10, now)]);
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { userId: 42n } });
    expect(sub.endsAt).toEqual(inDays(25));
  });

  it('does not lose days when two calls create the first subscription concurrently', async () => {
    await mkUser(42);
    await Promise.all([admin.addDays(1, 42, 10, now), admin.addDays(1, 42, 10, now)]);
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { userId: 42n } });
    expect(sub.endsAt).toEqual(inDays(20));
  });
});

describe('endSubscription', () => {
  it('ends an active subscription and logs it', async () => {
    await mkUser(42);
    await prisma.subscription.create({ data: { userId: 42n, endsAt: inDays(5) } });
    expect(await admin.endSubscription(1, 42, now)).toBe(true);
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { userId: 42n } });
    expect(sub.endsAt).toEqual(now);
    const log = await prisma.adminLog.findMany();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      adminId: 1n,
      action: 'subscription.end',
      targetUserId: 42n,
      details: { oldEndsAt: inDays(5).toISOString() },
    });
  });

  it('returns false without a log for an expired or missing subscription', async () => {
    await mkUser(42);
    await mkUser(43);
    await prisma.subscription.create({ data: { userId: 42n, endsAt: inDays(-1) } });
    expect(await admin.endSubscription(1, 42, now)).toBe(false);
    expect(await admin.endSubscription(1, 43, now)).toBe(false);
    expect(await prisma.adminLog.count()).toBe(0);
  });
});

describe('getSubscriberCard', () => {
  it('returns the 10 latest payments, newest first', async () => {
    await mkUser(42, { username: 'ivan' });
    for (let i = 0; i < 12; i++) {
      await prisma.payment.create({
        data: {
          userId: 42n,
          provider: 'PLATEGA',
          days: 30,
          amount: 100 + i,
          currency: 'RUB',
          status: 'PAID',
          createdAt: new Date(now.getTime() + i * 1000),
        },
      });
    }
    const card = await admin.getSubscriberCard(42);
    expect(card).not.toBeNull();
    expect(card?.id).toBe(42);
    expect(card?.username).toBe('ivan');
    expect(card?.endsAt).toBeNull();
    expect(card?.payments).toHaveLength(10);
    expect(card?.payments[0]).toMatchObject({ amount: 111, provider: 'PLATEGA', status: 'PAID' });
    expect(card?.payments[9]?.amount).toBe(102);
  });

  it('includes the subscription end and returns null for an unknown user', async () => {
    await mkUser(42);
    await prisma.subscription.create({ data: { userId: 42n, endsAt: inDays(5) } });
    expect((await admin.getSubscriberCard(42))?.endsAt).toEqual(inDays(5));
    expect(await admin.getSubscriberCard(99)).toBeNull();
  });
});

describe('plans', () => {
  it('changes the ruble price and logs old and new values', async () => {
    const plan = await prisma.plan.findFirstOrThrow({ where: { days: 30 } });
    await admin.setPlanPriceRub(1, plan.id, 55000);
    expect((await admin.getPlan(plan.id))?.priceRub).toBe(55000);
    const log = await prisma.adminLog.findMany();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      adminId: 1n,
      action: 'plan.price_rub',
      details: { planId: plan.id, old: 49000, new: 55000 },
    });
  });

  it('sets and clears the stars price', async () => {
    const plan = await prisma.plan.findFirstOrThrow({ where: { days: 30 } });
    await admin.setPlanPriceStars(1, plan.id, 300);
    expect((await admin.getPlan(plan.id))?.priceStars).toBe(300);
    await admin.setPlanPriceStars(1, plan.id, null);
    expect((await admin.getPlan(plan.id))?.priceStars).toBeNull();
    const log = await prisma.adminLog.findMany({ orderBy: { id: 'asc' } });
    expect(log.map((l) => l.action)).toEqual(['plan.price_stars', 'plan.price_stars']);
    expect(log[1]?.details).toMatchObject({ planId: plan.id, old: 300, new: null });
  });

  it('hides a plan but still lists it for the admin', async () => {
    const plan = await prisma.plan.findFirstOrThrow({ where: { days: 90 } });
    await admin.setPlanEnabled(1, plan.id, false);
    const all = await admin.listAllPlans();
    expect(all.map((p) => p.days)).toEqual([30, 90, 180]);
    expect(all.find((p) => p.id === plan.id)?.enabled).toBe(false);
    const log = await prisma.adminLog.findMany();
    expect(log[0]).toMatchObject({
      action: 'plan.enabled',
      details: { planId: plan.id, enabled: false },
    });
  });

  it('returns null for an unknown plan', async () => {
    expect(await admin.getPlan(999999)).toBeNull();
  });
});

describe('baseStats', () => {
  it('counts users, reachable, blocked and active', async () => {
    await mkUser(1);
    await mkUser(2, { blockedAt: now });
    await mkUser(3);
    await prisma.subscription.create({ data: { userId: 1n, endsAt: inDays(5) } });
    await prisma.subscription.create({ data: { userId: 3n, endsAt: inDays(-5) } });
    expect(await admin.baseStats(now)).toEqual({ users: 3, reachable: 2, blocked: 1, active: 1 });
  });
});
