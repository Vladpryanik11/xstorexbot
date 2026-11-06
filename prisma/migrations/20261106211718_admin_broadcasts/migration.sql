-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('RUNNING', 'DONE', 'STOPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "RecipientStatus" AS ENUM ('PENDING', 'SENT', 'BLOCKED', 'FAILED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" SERIAL NOT NULL,
    "adminId" BIGINT NOT NULL,
    "sourceChatId" BIGINT NOT NULL,
    "sourceMessageId" INTEGER NOT NULL,
    "buttonText" TEXT,
    "buttonUrl" TEXT,
    "status" "BroadcastStatus" NOT NULL DEFAULT 'RUNNING',
    "total" INTEGER NOT NULL,
    "progressMessageId" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastRecipient" (
    "broadcastId" INTEGER NOT NULL,
    "userId" BIGINT NOT NULL,
    "status" "RecipientStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentAt" TIMESTAMPTZ(3),

    CONSTRAINT "BroadcastRecipient_pkey" PRIMARY KEY ("broadcastId","userId")
);

-- CreateIndex
CREATE INDEX "BroadcastRecipient_broadcastId_status_idx" ON "BroadcastRecipient"("broadcastId", "status");

-- AddForeignKey
ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Одна рассылка RUNNING одновременно
CREATE UNIQUE INDEX "Broadcast_one_running" ON "Broadcast" ((true)) WHERE "status" = 'RUNNING';

-- Поиск пользователя по @username без учёта регистра
CREATE INDEX "User_username_lower_idx" ON "User" (lower("username"));
