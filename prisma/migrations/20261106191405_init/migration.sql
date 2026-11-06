-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('PLATEGA', 'STARS', 'MANUAL');

-- CreateEnum
CREATE TYPE "PaymentCurrency" AS ENUM ('RUB', 'XTR');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED', 'EXPIRED', 'REFUNDED', 'CHARGEBACK');

-- CreateEnum
CREATE TYPE "CertRequestStatus" AS ENUM ('OPEN', 'ISSUED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockedAt" TIMESTAMPTZ(3),
    "udidExpectedAt" TIMESTAMPTZ(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" SERIAL NOT NULL,
    "days" INTEGER NOT NULL,
    "priceRub" INTEGER NOT NULL,
    "priceStars" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "userId" BIGINT NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "reminded3dAt" TIMESTAMPTZ(3),
    "reminded1dAt" TIMESTAMPTZ(3),
    "removedAt" TIMESTAMPTZ(3),
    "removeAttempts" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "userId" BIGINT NOT NULL,
    "planId" INTEGER,
    "provider" "PaymentProvider" NOT NULL,
    "days" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" "PaymentCurrency" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "providerStatus" TEXT,
    "providerPaymentId" TEXT,
    "paymentUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMPTZ(3),
    "appliedAt" TIMESTAMPTZ(3),
    "lastCheckedAt" TIMESTAMPTZ(3),
    "createdByAdminId" BIGINT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertRequest" (
    "id" SERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "udid" TEXT NOT NULL,
    "status" "CertRequestStatus" NOT NULL DEFAULT 'OPEN',
    "p12Enc" BYTEA,
    "profileEnc" BYTEA,
    "passwordEnc" BYTEA,
    "certExpiresAt" TIMESTAMPTZ(3),
    "ordersChatMessageId" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedAt" TIMESTAMPTZ(3),
    "issuedByAdminId" BIGINT,

    CONSTRAINT "CertRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminLog" (
    "id" SERIAL NOT NULL,
    "adminId" BIGINT NOT NULL,
    "action" TEXT NOT NULL,
    "targetUserId" BIGINT,
    "details" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_days_key" ON "Plan"("days");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CertRequest_userId_idx" ON "CertRequest"("userId");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertRequest" ADD CONSTRAINT "CertRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CertRequest_one_open_per_user" ON "CertRequest" ("userId") WHERE "status" = 'OPEN';
INSERT INTO "Plan" ("days", "priceRub", "priceStars", "enabled", "sort") VALUES
  (30, 49000, NULL, true, 1), (90, 117000, NULL, true, 2), (180, 174000, NULL, true, 3);
