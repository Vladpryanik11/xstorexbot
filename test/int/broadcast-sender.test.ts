import { GrammyError, HttpError } from 'grammy';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBroadcasts } from '../../src/broadcast/index.js';
import type { SenderApi } from '../../src/broadcast/sender.js';
import { createBroadcastStore } from '../../src/broadcast/store.js';
import type { BroadcastButton } from '../../src/broadcast/types.js';
import type { Logger } from '../../src/logger.js';
import { texts } from '../../src/texts.js';
import { resetDb, testPrisma } from './helpers/db.js';

const prisma = testPrisma();
const store = createBroadcastStore(prisma);

beforeEach(() => resetDb(prisma));
afterAll(() => prisma.$disconnect());

const ADMIN = 1;
const SOURCE_CHAT = 555;

function tgError(code: number, description: string, parameters: object = {}) {
  return new GrammyError(
    'Call to copyMessage failed',
    { ok: false, error_code: code, description, parameters },
    'copyMessage',
    {},
  );
}

async function mkUsers(ids: number[]) {
  for (const id of ids) await prisma.user.create({ data: { id: BigInt(id), firstName: `U${id}` } });
}

function setup() {
  let nowMs = Date.parse('2026-11-07T10:00:00Z');
  const sleeps: number[] = [];
  const copies: Array<{ to: number; from: number; msg: number; other: unknown }> = [];
  const sends: Array<{ chatId: number; text: string; other: unknown }> = [];
  const edits: Array<{ at: number; text: string; other: unknown }> = [];
  const logged: unknown[] = [];
  const hooks = {
    copy: async (_to: number): Promise<void> => {},
    edit: async (): Promise<void> => {},
    send: async (_text: string): Promise<void> => {},
  };
  const api: SenderApi = {
    copyMessage: (async (to: number, from: number, msg: number, other?: unknown) => {
      copies.push({ to, from, msg, other });
      await hooks.copy(to);
      return { message_id: 1 };
    }) as unknown as SenderApi['copyMessage'],
    sendMessage: (async (chatId: number, text: string, other?: unknown) => {
      sends.push({ chatId, text, other });
      await hooks.send(text);
      return { message_id: 900 + sends.length };
    }) as unknown as SenderApi['sendMessage'],
    editMessageText: (async (_chat: number, _mid: number, text: string, other?: unknown) => {
      await hooks.edit();
      edits.push({ at: nowMs, text, other });
      return true;
    }) as unknown as SenderApi['editMessageText'],
  };
  const logger = {
    error: (...a: unknown[]) => logged.push(a),
    warn: (...a: unknown[]) => logged.push(a),
    info: () => {},
  } as unknown as Logger;
  const broadcasts = createBroadcasts({
    store,
    api: () => api,
    clock: () => new Date(nowMs),
    logger,
    sleep: async (ms) => {
      sleeps.push(ms);
      nowMs += ms;
    },
  });
  return { broadcasts, sleeps, copies, sends, edits, logged, hooks };
}

const input = { adminId: ADMIN, sourceChatId: SOURCE_CHAT, sourceMessageId: 7, button: null };

async function run(s: ReturnType<typeof setup>, button: BroadcastButton | null = null) {
  const res = await s.broadcasts.start({ ...input, button });
  if (!res.ok) throw new Error('start failed');
  await s.broadcasts.idle();
  return res.id;
}

async function statuses(id: number) {
  const rows = await prisma.broadcastRecipient.findMany({
    where: { broadcastId: id },
    orderBy: { userId: 'asc' },
  });
  return rows.map((r) => [Number(r.userId), r.status, r.error] as const);
}

describe('broadcast sender', () => {
  it('copies to every recipient, finishes DONE and sends the report', async () => {
    await mkUsers([10, 11, 12]);
    const s = setup();
    const id = await run(s);

    expect(s.copies.map((c) => [c.to, c.from, c.msg])).toEqual([
      [10, SOURCE_CHAT, 7],
      [11, SOURCE_CHAT, 7],
      [12, SOURCE_CHAT, 7],
    ]);
    expect((await statuses(id)).map((r) => r[1])).toEqual(['SENT', 'SENT', 'SENT']);
    expect((await store.summary(id)).status).toBe('DONE');
    expect(s.sends[0]).toMatchObject({ chatId: ADMIN, text: 'Рассылка: отправлено 0 из 3' });
    expect(JSON.stringify(s.sends[0]?.other)).toContain(`adm:bc:stop:${id}`);
    expect(s.sends.at(-1)).toMatchObject({
      chatId: ADMIN,
      text: 'Рассылка завершена.\nДоставлено: 3\nЗаблокировали бота: 0\nОшибки: 0',
    });
    expect((await store.get(id))?.progressMessageId).toBe(901);
    expect(s.edits.at(-1)?.other).toBeUndefined();
  });

  it('passes the url button as reply_markup', async () => {
    await mkUsers([10]);
    const s = setup();
    await run(s, { text: 'Открыть', url: 'https://example.com' });
    expect(JSON.stringify(s.copies[0]?.other)).toContain('https://example.com');
  });

  it('waits at least 40 ms after each send', async () => {
    await mkUsers([10, 11, 12]);
    const s = setup();
    await run(s);
    expect(s.sleeps.filter((ms) => ms >= 40).length).toBeGreaterThanOrEqual(3);
  });

  it('marks 403 as BLOCKED with User.blockedAt and other 400 as FAILED', async () => {
    await mkUsers([10, 11, 12]);
    const s = setup();
    s.hooks.copy = async (to) => {
      if (to === 10) throw tgError(403, 'Forbidden: bot was blocked by the user');
      if (to === 11) throw tgError(400, 'Bad Request: chat not found');
    };
    const id = await run(s);
    expect(await statuses(id)).toEqual([
      [10, 'BLOCKED', null],
      [11, 'FAILED', '400 Bad Request: chat not found'],
      [12, 'SENT', null],
    ]);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: 10n } })).blockedAt).not.toBeNull();
    expect((await store.summary(id)).status).toBe('DONE');
  });

  it('sleeps retry_after on 429 and resends to the same recipient', async () => {
    await mkUsers([10]);
    const s = setup();
    let first = true;
    s.hooks.copy = async () => {
      if (first) {
        first = false;
        throw tgError(429, 'Too Many Requests: retry after 3', { retry_after: 3 });
      }
    };
    const id = await run(s);
    expect(s.sleeps).toContain(3000);
    expect(s.copies.map((c) => c.to)).toEqual([10, 10]);
    expect(await statuses(id)).toEqual([[10, 'SENT', null]]);
  });

  it('floors a retry wait below 1000 ms to 1000 ms', async () => {
    await mkUsers([10]);
    const s = setup();
    let first = true;
    s.hooks.copy = async () => {
      if (first) {
        first = false;
        throw tgError(429, 'Too Many Requests');
      }
    };
    await run(s);
    expect(s.sleeps).toContain(1000);
    expect(s.sleeps).not.toContain(0);
  });

  it('waits 5000 ms on a network error and then delivers', async () => {
    await mkUsers([10]);
    const s = setup();
    let first = true;
    s.hooks.copy = async () => {
      if (first) {
        first = false;
        throw new HttpError('Network request failed', new Error('socket hang up'));
      }
    };
    const id = await run(s);
    expect(s.sleeps).toContain(5000);
    expect(await statuses(id)).toEqual([[10, 'SENT', null]]);
  });

  it('fails the broadcast when the source message is gone', async () => {
    await mkUsers([10, 11, 12]);
    const s = setup();
    s.hooks.copy = async () => {
      throw tgError(400, 'Bad Request: message to copy not found');
    };
    const id = await run(s);
    expect((await store.summary(id)).status).toBe('FAILED');
    expect((await statuses(id)).map((r) => r[1])).toEqual(['PENDING', 'PENDING', 'PENDING']);
    expect(s.sends.at(-1)?.text).toMatch(/^Рассылка прервана/);
  });

  it('stops after the current recipient and reports STOPPED', async () => {
    await mkUsers([10, 11, 12]);
    const s = setup();
    let bid = 0;
    s.hooks.copy = async () => {
      if (s.copies.length === 1) expect(await s.broadcasts.stop(ADMIN, bid)).toBe(true);
    };
    const res = await s.broadcasts.start(input);
    if (!res.ok) throw new Error('start failed');
    bid = res.id;
    await s.broadcasts.idle();
    expect(s.copies).toHaveLength(1);
    expect((await store.summary(bid)).status).toBe('STOPPED');
    expect((await statuses(bid)).map((r) => r[1])).toEqual(['SENT', 'PENDING', 'PENDING']);
    expect(s.sends.at(-1)?.text).toMatch(/^Рассылка остановлена/);
  });

  it('edits progress no more than once per interval', async () => {
    await mkUsers(Array.from({ length: 260 }, (_, i) => 1000 + i));
    const s = setup();
    await run(s);
    const throttled = s.edits.filter((e) => e.other !== undefined);
    expect(throttled.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < throttled.length; i++) {
      expect((throttled[i]?.at ?? 0) - (throttled[i - 1]?.at ?? 0)).toBeGreaterThanOrEqual(5000);
    }
  });

  it('ignores progress edit errors', async () => {
    await mkUsers(Array.from({ length: 200 }, (_, i) => 1000 + i));
    const s = setup();
    s.hooks.edit = async () => {
      throw tgError(400, 'Bad Request: message is not modified');
    };
    const id = await run(s);
    expect((await store.summary(id)).status).toBe('DONE');
  });

  it('resume continues a RUNNING broadcast and sends only to pending recipients', async () => {
    await mkUsers([10, 11, 12]);
    const created = await store.create(input, new Date('2026-11-07T10:00:00Z'));
    if (!created.ok) throw new Error('create failed');
    await store.markSent(created.id, 10, new Date('2026-11-07T10:00:01Z'));
    await store.setProgressMessage(created.id, 777);
    const s = setup();
    await s.broadcasts.resume();
    await s.broadcasts.idle();
    expect(s.copies.map((c) => c.to)).toEqual([11, 12]);
    expect((await store.summary(created.id)).status).toBe('DONE');
    expect(s.sends).toHaveLength(1);
  });

  it('keeps the broadcast RUNNING and logs without a rejection on an unexpected error', async () => {
    await mkUsers([10, 11]);
    const s = setup();
    s.hooks.copy = async () => {
      throw new TypeError('boom');
    };
    const res = await s.broadcasts.start(input);
    if (!res.ok) throw new Error('start failed');
    await s.broadcasts.idle();
    expect((await store.summary(res.id)).status).toBe('RUNNING');
    expect(s.logged.length).toBeGreaterThan(0);
  });

  it('stop without a running loop edits progress and sends the report itself', async () => {
    await mkUsers([10, 11]);
    const created = await store.create(input, new Date('2026-11-07T10:00:00Z'));
    if (!created.ok) throw new Error('create failed');
    await store.setProgressMessage(created.id, 777);
    const s = setup();
    expect(await s.broadcasts.stop(ADMIN, created.id)).toBe(true);
    expect((await store.summary(created.id)).status).toBe('STOPPED');
    expect(s.copies).toHaveLength(0);
    expect(s.edits).toHaveLength(1);
    expect(s.edits[0]?.other).toBeUndefined();
    expect(s.sends.at(-1)).toMatchObject({ chatId: ADMIN });
    expect(s.sends.at(-1)?.text).toMatch(/^Рассылка остановлена/);
  });

  it('a finishing loop does not clear the state of a newer broadcast', async () => {
    await mkUsers([10]);
    const s = setup();
    let releaseReport: () => void = () => {};
    const reportGate = new Promise<void>((r) => {
      releaseReport = r;
    });
    let reportReached: () => void = () => {};
    const reached = new Promise<void>((r) => {
      reportReached = r;
    });
    s.hooks.send = async (text) => {
      if (text.startsWith('Рассылка завершена')) {
        reportReached();
        await reportGate;
      }
    };
    const a = await s.broadcasts.start(input);
    if (!a.ok) throw new Error('start failed');
    const loopA = s.broadcasts.idle();
    await reached;

    let releaseCopy: () => void = () => {};
    const copyGate = new Promise<void>((r) => {
      releaseCopy = r;
    });
    s.hooks.copy = async () => {
      await copyGate;
    };
    const b = await s.broadcasts.start(input);
    if (!b.ok) throw new Error('start B failed');

    releaseReport();
    await loopA;
    await s.broadcasts.resume();
    // Даём возможному второму циклу дойти до copyMessage, пока первый заблокирован.
    await new Promise((r) => setTimeout(r, 300));
    releaseCopy();
    await s.broadcasts.idle();
    expect(s.copies).toHaveLength(2);
    expect((await store.summary(b.id)).status).toBe('DONE');
  });

  it('resume is a no-op while a loop is running', async () => {
    await mkUsers([10]);
    const s = setup();
    let releaseCopy: () => void = () => {};
    const gate = new Promise<void>((r) => {
      releaseCopy = r;
    });
    s.hooks.copy = async () => {
      await gate;
    };
    const res = await s.broadcasts.start(input);
    if (!res.ok) throw new Error('start failed');
    await s.broadcasts.resume();
    releaseCopy();
    await s.broadcasts.idle();
    expect(s.copies).toHaveLength(1);
  });

  it('logs a failed report without claiming the loop aborted', async () => {
    await mkUsers([10]);
    const s = setup();
    s.hooks.send = async (text) => {
      if (text.startsWith('Рассылка завершена')) throw new Error('send failed');
    };
    const id = await run(s);
    expect((await store.summary(id)).status).toBe('DONE');
    expect(JSON.stringify(s.logged)).toContain('broadcast report failed');
    expect(JSON.stringify(s.logged)).not.toContain('loop aborted');
  });

  it('notifies the admin when an unexpected error aborts the loop, status untouched', async () => {
    await mkUsers([10, 11]);
    const s = setup();
    const spy = vi.spyOn(store, 'markSent').mockRejectedValueOnce(new TypeError('boom'));
    try {
      const res = await s.broadcasts.start(input);
      if (!res.ok) throw new Error('start failed');
      await s.broadcasts.idle();
      expect((await store.summary(res.id)).status).toBe('RUNNING');
      expect(s.sends.at(-1)).toMatchObject({ chatId: ADMIN, text: texts.admin.broadcastPaused });
      expect(s.sends.some((x) => x.text.startsWith('Рассылка завершена'))).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('a failing pause notice is logged and never throws', async () => {
    await mkUsers([10]);
    const s = setup();
    const spy = vi.spyOn(store, 'markSent').mockRejectedValueOnce(new TypeError('boom'));
    s.hooks.send = async (text) => {
      if (text === texts.admin.broadcastPaused) throw new Error('send failed');
    };
    try {
      const res = await s.broadcasts.start(input);
      if (!res.ok) throw new Error('start failed');
      await expect(s.broadcasts.idle()).resolves.toBeUndefined();
      expect(JSON.stringify(s.logged)).toContain('broadcast pause notice failed');
    } finally {
      spy.mockRestore();
    }
  });

  it('stop sends the report exactly once when the loop finishes while store.stop is pending', async () => {
    await mkUsers([10]);
    const s = setup();
    let releaseCopy: () => void = () => {};
    const copyGate = new Promise<void>((r) => {
      releaseCopy = r;
    });
    s.hooks.copy = async () => {
      await copyGate;
    };
    let releaseStop: () => void = () => {};
    const stopGate = new Promise<void>((r) => {
      releaseStop = r;
    });
    const realStop = store.stop.bind(store);
    const spy = vi.spyOn(store, 'stop').mockImplementation(async (...args) => {
      const result = await realStop(...args);
      await stopGate;
      return result;
    });
    try {
      const res = await s.broadcasts.start(input);
      if (!res.ok) throw new Error('start failed');
      // Цикл уже внутри copyMessage: stop вызывается при живом цикле.
      while (s.copies.length === 0) await new Promise((r) => setTimeout(r, 5));
      const stopP = s.broadcasts.stop(ADMIN, res.id);
      await new Promise((r) => setTimeout(r, 50));
      releaseCopy();
      await s.broadcasts.idle();
      releaseStop();
      expect(await stopP).toBe(true);
      // Первое сообщение — прогресс, остальное — отчёты.
      expect(s.sends.slice(1)).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('shutdown stops the loop after the current recipient without finishing or reporting', async () => {
    await mkUsers([10, 11, 12]);
    const s = setup();
    s.hooks.copy = async () => {
      if (s.copies.length === 1) s.broadcasts.shutdown();
    };
    const res = await s.broadcasts.start(input);
    if (!res.ok) throw new Error('start failed');
    await s.broadcasts.idle();
    expect(s.copies).toHaveLength(1);
    expect((await store.summary(res.id)).status).toBe('RUNNING');
    // Только сообщение с прогрессом, отчёта нет.
    expect(s.sends).toHaveLength(1);
    expect(s.edits.some((e) => e.other === undefined)).toBe(false);
  });
});
