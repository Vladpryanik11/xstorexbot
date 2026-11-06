import type { PrismaClient } from '../generated/prisma/client.js';

export interface TelegramFrom {
  id: number;
  username?: string;
  first_name: string;
}

export async function touchUser(prisma: PrismaClient, from: TelegramFrom): Promise<void> {
  const data = { username: from.username ?? null, firstName: from.first_name, blockedAt: null };
  await prisma.user.upsert({
    where: { id: BigInt(from.id) },
    create: { id: BigInt(from.id), ...data },
    update: data,
  });
}
