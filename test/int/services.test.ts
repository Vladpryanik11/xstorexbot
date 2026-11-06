import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createServices } from '../../src/services/index.js';
import { resetDb, testPrisma } from './helpers/db.js';

const prisma = testPrisma();
const services = createServices(prisma);

beforeEach(() => resetDb(prisma));
afterAll(() => prisma.$disconnect());

const t0 = new Date('2026-11-07T10:00:00Z');
const t1 = new Date('2026-11-07T11:00:00Z');

describe('touchUser', () => {
  it('sets lastSeenAt and refreshes it on the next call', async () => {
    await services.touchUser({ id: 10, first_name: 'Гена' }, t0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: 10n } })).lastSeenAt).toEqual(t0);
    await services.touchUser({ id: 10, first_name: 'Гена' }, t1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: 10n } })).lastSeenAt).toEqual(t1);
  });

  it('creates a user without username, then updates it without duplicating', async () => {
    await services.touchUser({ id: 1, first_name: 'Аня' }, t0);
    const created = await prisma.user.findUniqueOrThrow({ where: { id: 1n } });
    expect(created.username).toBeNull();
    expect(created.firstName).toBe('Аня');

    await services.touchUser({ id: 1, first_name: 'Аня', username: 'anya' }, t0);
    expect(await prisma.user.count()).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: 1n } })).username).toBe('anya');
  });

  it('clears blockedAt when the user returns', async () => {
    await prisma.user.create({ data: { id: 2n, firstName: 'Боря', blockedAt: new Date() } });
    await services.touchUser({ id: 2, first_name: 'Боря' }, t0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: 2n } })).blockedAt).toBeNull();
  });

  it('resets username to null when it was removed in Telegram', async () => {
    await services.touchUser({ id: 3, first_name: 'Вера', username: 'vera' }, t0);
    await services.touchUser({ id: 3, first_name: 'Вера' }, t0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: 3n } })).username).toBeNull();
  });
});

describe('setBlocked and markBlocked', () => {
  it('sets and clears blockedAt', async () => {
    await services.touchUser({ id: 20, first_name: 'Дима' }, t0);
    await services.setBlocked({ id: 20, first_name: 'Дима' }, t1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: 20n } })).blockedAt).toEqual(t1);
    await services.setBlocked({ id: 20, first_name: 'Дима' }, null);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: 20n } })).blockedAt).toBeNull();
  });

  it('does not change lastSeenAt of an existing user', async () => {
    await services.touchUser({ id: 21, first_name: 'Е' }, t0);
    await services.setBlocked({ id: 21, first_name: 'Е' }, t1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: 21n } })).lastSeenAt).toEqual(t0);
  });

  it('creates an unknown user', async () => {
    await services.setBlocked({ id: 22, first_name: 'Ж', username: 'zh' }, t1);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: 22n } });
    expect(u.blockedAt).toEqual(t1);
    expect(u.username).toBe('zh');
  });

  it('markBlocked sets blockedAt and ignores an unknown id', async () => {
    await services.touchUser({ id: 23, first_name: 'З' }, t0);
    await services.markBlocked(23, t1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: 23n } })).blockedAt).toEqual(t1);
    await expect(services.markBlocked(999, t1)).resolves.toBeUndefined();
    expect(await prisma.user.count()).toBe(1);
  });
});

describe('getActiveUntil', () => {
  const now = new Date('2026-11-06T12:00:00Z');

  it('returns null without subscription', async () => {
    expect(await services.getActiveUntil(1, now)).toBeNull();
  });

  it('returns null when expired', async () => {
    await prisma.user.create({ data: { id: 1n, firstName: 'А' } });
    await prisma.subscription.create({
      data: { userId: 1n, endsAt: new Date('2026-11-01T00:00:00Z') },
    });
    expect(await services.getActiveUntil(1, now)).toBeNull();
  });

  it('returns endsAt when in the future', async () => {
    await prisma.user.create({ data: { id: 1n, firstName: 'А' } });
    const endsAt = new Date('2026-12-01T00:00:00Z');
    await prisma.subscription.create({ data: { userId: 1n, endsAt } });
    expect(await services.getActiveUntil(1, now)).toEqual(endsAt);
  });
});

describe('plans', () => {
  it('lists three enabled plans in sort order', async () => {
    const plans = await services.listEnabledPlans();
    expect(plans.map((p) => [p.days, p.priceRub, p.priceStars])).toEqual([
      [30, 49000, null],
      [90, 117000, null],
      [180, 174000, null],
    ]);
  });

  it('hides disabled plans from list and getEnabledPlan', async () => {
    const hidden = await prisma.plan.update({ where: { days: 90 }, data: { enabled: false } });
    expect((await services.listEnabledPlans()).map((p) => p.days)).toEqual([30, 180]);
    expect(await services.getEnabledPlan(hidden.id)).toBeNull();
  });

  it('returns an enabled plan by id and null for unknown id', async () => {
    const [first] = await services.listEnabledPlans();
    expect(first).toBeDefined();
    expect(await services.getEnabledPlan(first?.id ?? 0)).toEqual(first);
    expect(await services.getEnabledPlan(999)).toBeNull();
  });
});
