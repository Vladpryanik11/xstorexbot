import type { Prisma } from '../generated/prisma/client.js';

export type AdminLogEntry = {
  adminId: number;
  action: string;
  targetUserId?: number;
  /** Только код и описание; без секретов и URL запросов. */
  details: Prisma.InputJsonValue;
};

export async function writeAdminLog(
  tx: Prisma.TransactionClient,
  entry: AdminLogEntry,
): Promise<void> {
  await tx.adminLog.create({
    data: {
      adminId: BigInt(entry.adminId),
      action: entry.action,
      targetUserId: entry.targetUserId === undefined ? null : BigInt(entry.targetUserId),
      details: entry.details,
    },
  });
}
