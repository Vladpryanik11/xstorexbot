import { createPrisma } from '../../../src/db.js';
import type { PrismaClient } from '../../../src/generated/prisma/client.js';

export function testPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST не задан');
  return createPrisma(url);
}

/** Только для тестов: очищает данные и возвращает три тарифа к начальным значениям. */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "User", "Subscription", "Payment", "CertRequest", "AdminLog" CASCADE',
  );
  await prisma.plan.deleteMany();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Plan" ("days", "priceRub", "priceStars", "enabled", "sort") VALUES
      (30, 49000, NULL, true, 1), (90, 117000, NULL, true, 2), (180, 174000, NULL, true, 3)`,
  );
}
