import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testPrisma } from './helpers/db.js';

const prisma = testPrisma();

beforeEach(() => resetDb(prisma));
afterAll(() => prisma.$disconnect());

describe('schema', () => {
  it('seeds exactly three plans', async () => {
    const plans = await prisma.plan.findMany({ orderBy: { sort: 'asc' } });
    expect(plans.map((p) => [p.days, p.priceRub])).toEqual([
      [30, 49000],
      [90, 117000],
      [180, 174000],
    ]);
    expect(plans.every((p) => p.priceStars === null && p.enabled)).toBe(true);
  });

  it('allows only one OPEN cert request per user', async () => {
    await prisma.user.create({ data: { id: 1n, firstName: 'Аня' } });
    await prisma.certRequest.create({ data: { userId: 1n, udid: 'A', status: 'OPEN' } });
    await expect(
      prisma.certRequest.create({ data: { userId: 1n, udid: 'B', status: 'OPEN' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.certRequest.create({ data: { userId: 1n, udid: 'C', status: 'ISSUED' } }),
    ).resolves.toBeDefined();
  });

  it('вторая рассылка RUNNING запрещена индексом', async () => {
    const data = { adminId: 1n, sourceChatId: 1n, sourceMessageId: 1, total: 0 };
    await prisma.broadcast.create({ data });
    await expect(prisma.broadcast.create({ data })).rejects.toMatchObject({ code: 'P2002' });
    await prisma.broadcast.create({ data: { ...data, status: 'DONE' } }); // не мешает
  });

  it('у нового пользователя lastSeenAt заполнен', async () => {
    const u = await prisma.user.create({ data: { id: 1n, firstName: 'А' } });
    expect(u.lastSeenAt).toBeInstanceOf(Date);
  });

  it('есть индекс по lower(username)', async () => {
    const rows = await prisma.$queryRawUnsafe<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'User'`,
    );
    expect(rows.some((r) => r.indexdef.includes('lower'))).toBe(true);
  });
});
