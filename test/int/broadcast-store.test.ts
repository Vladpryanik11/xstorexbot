import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createBroadcastStore } from '../../src/broadcast/store.js';
import { resetDb, testPrisma } from './helpers/db.js';

const prisma = testPrisma();
const store = createBroadcastStore(prisma);

beforeEach(() => resetDb(prisma));
afterAll(() => prisma.$disconnect());

const now = new Date('2026-11-07T10:00:00Z');
const later = new Date('2026-11-07T11:00:00Z');
const input = { adminId: 1, sourceChatId: 1, sourceMessageId: 7, button: null };

async function mkUser(id: number, blockedAt: Date | null = null) {
  await prisma.user.create({ data: { id: BigInt(id), firstName: `U${id}`, blockedAt } });
}

async function startWithUsers() {
  await mkUser(10);
  await mkUser(11);
  await mkUser(12);
  const res = await store.create(input, now);
  if (!res.ok) throw new Error('create failed');
  return res.id;
}

describe('create', () => {
  it('snapshots only unblocked users and ignores users created later', async () => {
    await mkUser(10);
    await mkUser(11, now);
    await mkUser(12);
    expect(await store.countRecipients()).toBe(2);

    const res = await store.create(input, now);
    expect(res).toMatchObject({ ok: true, total: 2 });
    if (!res.ok) return;
    await mkUser(13);

    expect(await store.pending(res.id, 10)).toEqual([10, 12]);
    expect((await store.summary(res.id)).total).toBe(2);
    expect(await prisma.broadcastRecipient.count({ where: { broadcastId: res.id } })).toBe(2);
  });

  it('stores the button and writes broadcast.start to the admin log', async () => {
    await mkUser(10);
    const button = { text: 'Открыть', url: 'https://example.com' };
    const res = await store.create({ ...input, button }, now);
    if (!res.ok) throw new Error('create failed');
    const row = await store.get(res.id);
    expect(row).toMatchObject({
      id: res.id,
      adminId: 1,
      sourceMessageId: 7,
      button,
      status: 'RUNNING',
    });
    expect(row?.progressMessageId).toBeNull();
    const log = await prisma.adminLog.findFirstOrThrow({ where: { action: 'broadcast.start' } });
    expect(log.details).toEqual({ broadcastId: res.id, total: 1 });
  });

  it('refuses a second create while one is running and adds no rows', async () => {
    const id = await startWithUsers();
    expect(await store.create(input, now)).toEqual({ ok: false, reason: 'running' });
    expect(await prisma.broadcast.count()).toBe(1);
    expect(await prisma.broadcastRecipient.count()).toBe(3);
    expect(await store.running()).toBe(id);
  });

  it('lets exactly one of two parallel creates win', async () => {
    await mkUser(10);
    const results = await Promise.all([store.create(input, now), store.create(input, now)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.broadcast.count()).toBe(1);
    expect(await prisma.broadcastRecipient.count()).toBe(1);
  });

  it('allows a new broadcast after the previous one finished', async () => {
    const id = await startWithUsers();
    await store.finish(id, 'DONE', later);
    expect(await store.running()).toBeNull();
    expect((await store.create(input, later)).ok).toBe(true);
  });
});

describe('recipient marks', () => {
  it('markSent and markFailed update status; pending excludes them', async () => {
    const id = await startWithUsers();
    await store.markSent(id, 10, later);
    await store.markFailed(id, 11, '400 chat not found');
    expect(await store.pending(id, 10)).toEqual([12]);
    const sent = await prisma.broadcastRecipient.findFirstOrThrow({ where: { userId: 10n } });
    expect(sent.sentAt).toEqual(later);
    const failed = await prisma.broadcastRecipient.findFirstOrThrow({ where: { userId: 11n } });
    expect(failed).toMatchObject({ status: 'FAILED', error: '400 chat not found' });
  });

  it('pending respects the limit and orders by userId', async () => {
    const id = await startWithUsers();
    expect(await store.pending(id, 2)).toEqual([10, 11]);
  });

  it('markBlocked sets BLOCKED and User.blockedAt', async () => {
    const id = await startWithUsers();
    await store.markBlocked(id, 11, later);
    const rec = await prisma.broadcastRecipient.findFirstOrThrow({ where: { userId: 11n } });
    expect(rec.status).toBe('BLOCKED');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: 11n } });
    expect(user.blockedAt).toEqual(later);
  });

  it('setProgressMessage is stored', async () => {
    const id = await startWithUsers();
    await store.setProgressMessage(id, 99);
    expect((await store.get(id))?.progressMessageId).toBe(99);
  });
});

describe('summary, latest, finish, stop', () => {
  it('summary counts every status', async () => {
    await mkUser(13);
    const id = await startWithUsers();
    await store.markSent(id, 10, later);
    await store.markBlocked(id, 11, later);
    await store.markFailed(id, 12, 'x');
    const s = await store.summary(id);
    expect(s).toMatchObject({
      id,
      status: 'RUNNING',
      total: 4,
      sent: 1,
      blocked: 1,
      failed: 1,
      pending: 1,
    });
    expect(s.createdAt).toEqual(now);
    expect(s.finishedAt).toBeNull();
  });

  it('latest prefers the running one, otherwise the newest, otherwise null', async () => {
    expect(await store.latest()).toBeNull();
    const first = await startWithUsers();
    expect((await store.latest())?.id).toBe(first);
    await store.finish(first, 'DONE', later);
    const second = await store.create(input, later);
    if (!second.ok) throw new Error('create failed');
    expect((await store.latest())?.id).toBe(second.id);
    await store.finish(second.id, 'FAILED', later);
    expect(await store.latest()).toMatchObject({
      id: second.id,
      status: 'FAILED',
      finishedAt: later,
    });
  });

  it('finish does not touch a STOPPED broadcast', async () => {
    const id = await startWithUsers();
    expect(await store.stop(1, id, later)).toBe(true);
    await store.finish(id, 'DONE', new Date('2026-11-07T12:00:00Z'));
    const s = await store.summary(id);
    expect(s.status).toBe('STOPPED');
    expect(s.finishedAt).toEqual(later);
  });

  it('stop writes broadcast.stop and returns false for a finished broadcast', async () => {
    const id = await startWithUsers();
    expect(await store.stop(5, id, later)).toBe(true);
    const log = await prisma.adminLog.findFirstOrThrow({ where: { action: 'broadcast.stop' } });
    expect(log.adminId).toBe(5n);
    expect(log.details).toEqual({ broadcastId: id, total: 3 });
    expect(await store.stop(5, id, later)).toBe(false);
    expect(await prisma.adminLog.count({ where: { action: 'broadcast.stop' } })).toBe(1);
  });
});
