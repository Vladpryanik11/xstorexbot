import { writeAdminLog } from '../admin/log.js';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import type { BroadcastButton, BroadcastSummary } from './types.js';

export interface BroadcastStore {
  /** Пользователи без blockedAt. */
  countRecipients(): Promise<number>;
  create(
    input: {
      adminId: number;
      sourceChatId: number;
      sourceMessageId: number;
      button: BroadcastButton | null;
    },
    now: Date,
  ): Promise<{ ok: true; id: number; total: number } | { ok: false; reason: 'running' }>;
  get(id: number): Promise<{
    id: number;
    adminId: number;
    sourceChatId: number;
    sourceMessageId: number;
    button: BroadcastButton | null;
    status: BroadcastSummary['status'];
    progressMessageId: number | null;
  } | null>;
  /** Id идущей рассылки. */
  running(): Promise<number | null>;
  summary(id: number): Promise<BroadcastSummary>;
  /** Идущая, иначе последняя по createdAt. */
  latest(): Promise<BroadcastSummary | null>;
  /** userId со статусом PENDING по возрастанию. */
  pending(id: number, limit: number): Promise<number[]>;
  markSent(id: number, userId: number, now: Date): Promise<void>;
  /** Ставит BLOCKED и User.blockedAt = now в одной транзакции. */
  markBlocked(id: number, userId: number, now: Date): Promise<void>;
  /** error — только код и описание ошибки Telegram, без URL запроса. */
  markFailed(id: number, userId: number, error: string): Promise<void>;
  setProgressMessage(id: number, messageId: number): Promise<void>;
  /** Только из RUNNING: остановленную рассылку не трогает. */
  finish(id: number, status: 'DONE' | 'FAILED', now: Date): Promise<void>;
  /** RUNNING → STOPPED и запись в журнал; false, если уже не идёт. */
  stop(adminId: number, id: number, now: Date): Promise<boolean>;
}

const RUNNING_INDEX = 'Broadcast_one_running';

/** P2002 именно по индексу одной идущей рассылки (adapter-pg кладёт имя индекса в meta). */
function isRunningIndexViolation(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === 'P2002' &&
    JSON.stringify(e.meta ?? {}).includes(RUNNING_INDEX)
  );
}

export function createBroadcastStore(prisma: PrismaClient): BroadcastStore {
  async function summary(id: number): Promise<BroadcastSummary> {
    const row = await prisma.broadcast.findUniqueOrThrow({ where: { id } });
    const groups = await prisma.broadcastRecipient.groupBy({
      by: ['status'],
      where: { broadcastId: id },
      _count: { _all: true },
    });
    const count = (status: string) => groups.find((g) => g.status === status)?._count._all ?? 0;
    return {
      id: row.id,
      status: row.status,
      total: row.total,
      sent: count('SENT'),
      blocked: count('BLOCKED'),
      failed: count('FAILED'),
      pending: count('PENDING'),
      createdAt: row.createdAt,
      finishedAt: row.finishedAt,
    };
  }

  async function running(): Promise<number | null> {
    const row = await prisma.broadcast.findFirst({
      where: { status: 'RUNNING' },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  return {
    countRecipients: () => prisma.user.count({ where: { blockedAt: null } }),

    async create(input, now) {
      try {
        return await prisma.$transaction(async (tx) => {
          const broadcast = await tx.broadcast.create({
            data: {
              adminId: BigInt(input.adminId),
              sourceChatId: BigInt(input.sourceChatId),
              sourceMessageId: input.sourceMessageId,
              buttonText: input.button?.text ?? null,
              buttonUrl: input.button?.url ?? null,
              total: 0,
              createdAt: now,
            },
          });
          const total = await tx.$executeRaw`
            INSERT INTO "BroadcastRecipient" ("broadcastId", "userId")
            SELECT ${broadcast.id}, "id" FROM "User" WHERE "blockedAt" IS NULL`;
          await tx.broadcast.update({ where: { id: broadcast.id }, data: { total } });
          await writeAdminLog(tx, {
            adminId: input.adminId,
            action: 'broadcast.start',
            details: { broadcastId: broadcast.id, total },
          });
          return { ok: true as const, id: broadcast.id, total };
        });
      } catch (e) {
        // Частичный уникальный индекс Broadcast_one_running: рассылка уже идёт.
        if (isRunningIndexViolation(e)) {
          return { ok: false as const, reason: 'running' as const };
        }
        throw e;
      }
    },

    async get(id) {
      const row = await prisma.broadcast.findUnique({ where: { id } });
      if (!row) return null;
      return {
        id: row.id,
        adminId: Number(row.adminId),
        sourceChatId: Number(row.sourceChatId),
        sourceMessageId: row.sourceMessageId,
        button:
          row.buttonText !== null && row.buttonUrl !== null
            ? { text: row.buttonText, url: row.buttonUrl }
            : null,
        status: row.status,
        progressMessageId: row.progressMessageId,
      };
    },

    running,
    summary,

    async latest() {
      const id =
        (await running()) ??
        (
          await prisma.broadcast.findFirst({
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { id: true },
          })
        )?.id;
      return id === undefined ? null : summary(id);
    },

    async pending(id, limit) {
      const rows = await prisma.broadcastRecipient.findMany({
        where: { broadcastId: id, status: 'PENDING' },
        orderBy: { userId: 'asc' },
        take: limit,
        select: { userId: true },
      });
      return rows.map((r) => Number(r.userId));
    },

    async markSent(id, userId, now) {
      await prisma.broadcastRecipient.updateMany({
        where: { broadcastId: id, userId: BigInt(userId), status: 'PENDING' },
        data: { status: 'SENT', sentAt: now },
      });
    },

    async markBlocked(id, userId, now) {
      await prisma.$transaction(async (tx) => {
        const res = await tx.broadcastRecipient.updateMany({
          where: { broadcastId: id, userId: BigInt(userId), status: 'PENDING' },
          data: { status: 'BLOCKED' },
        });
        if (res.count === 0) return;
        await tx.user.updateMany({
          where: { id: BigInt(userId), blockedAt: null },
          data: { blockedAt: now },
        });
      });
    },

    async markFailed(id, userId, error) {
      await prisma.broadcastRecipient.updateMany({
        where: { broadcastId: id, userId: BigInt(userId), status: 'PENDING' },
        data: { status: 'FAILED', error },
      });
    },

    async setProgressMessage(id, messageId) {
      await prisma.broadcast.update({ where: { id }, data: { progressMessageId: messageId } });
    },

    async finish(id, status, now) {
      await prisma.broadcast.updateMany({
        where: { id, status: 'RUNNING' },
        data: { status, finishedAt: now },
      });
    },

    async stop(adminId, id, now) {
      return prisma.$transaction(async (tx) => {
        const res = await tx.broadcast.updateMany({
          where: { id, status: 'RUNNING' },
          data: { status: 'STOPPED', finishedAt: now },
        });
        if (res.count === 0) return false;
        const row = await tx.broadcast.findUniqueOrThrow({
          where: { id },
          select: { total: true },
        });
        await writeAdminLog(tx, {
          adminId,
          action: 'broadcast.stop',
          details: { broadcastId: id, total: row.total },
        });
        return true;
      });
    },
  };
}
