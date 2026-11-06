import type { PrismaClient } from '../generated/prisma/client.js';

export interface TelegramFrom {
  id: number;
  username?: string;
  first_name: string;
}

/** Покупатель написал боту или нажал кнопку: обновляем профиль и lastSeenAt, снимаем блокировку. */
export async function touchUser(
  prisma: PrismaClient,
  from: TelegramFrom,
  now: Date,
): Promise<void> {
  const data = {
    username: from.username ?? null,
    firstName: from.first_name,
    blockedAt: null,
    lastSeenAt: now,
  };
  await prisma.user.upsert({
    where: { id: BigInt(from.id) },
    create: { id: BigInt(from.id), ...data },
    update: data,
  });
}

/** Отметка блокировки бота (my_chat_member); lastSeenAt не меняется. */
export async function setBlocked(
  prisma: PrismaClient,
  from: TelegramFrom,
  blockedAt: Date | null,
): Promise<void> {
  const data = { username: from.username ?? null, firstName: from.first_name, blockedAt };
  await prisma.user.upsert({
    where: { id: BigInt(from.id) },
    create: { id: BigInt(from.id), ...data },
    update: data,
  });
}

/** Telegram ответил 403 вне рассылки: помечаем, если такой пользователь есть. */
export async function markBlocked(prisma: PrismaClient, userId: number, now: Date): Promise<void> {
  await prisma.user.updateMany({ where: { id: BigInt(userId) }, data: { blockedAt: now } });
}
