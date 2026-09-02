-- CreateEnum
CREATE TYPE "FundingStatus" AS ENUM ('OPEN', 'SUCCEEDED', 'SETTLED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContributionStatus" AS ENUM ('RESERVED', 'PAID', 'REFUNDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'FUNDING_CONTRIBUTION_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'FUNDING_SUCCEEDED';
ALTER TYPE "NotificationType" ADD VALUE 'FUNDING_FAILED_REFUNDED';
ALTER TYPE "NotificationType" ADD VALUE 'FUNDING_ORGANIZER_TOPUP';

-- CreateTable
CREATE TABLE "Funding" (
    "id" UUID NOT NULL,
    "organizerId" UUID NOT NULL,
    "receiverId" UUID NOT NULL,
    "status" "FundingStatus" NOT NULL DEFAULT 'OPEN',
    "productId" UUID NOT NULL,
    "productSnapshot" JSONB NOT NULL,
    "goalAmount" INTEGER NOT NULL,
    "minAmount" INTEGER NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "organizerPaymentMethodId" UUID,
    "organizerConsentAgreedAt" TIMESTAMP(3),
    "consentVersion" TEXT,
    "receiverDisplayName" TEXT NOT NULL,
    "topupAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "topupRetryUntil" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Funding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingContribution" (
    "id" UUID NOT NULL,
    "fundingId" UUID NOT NULL,
    "contributorId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "ContributionStatus" NOT NULL DEFAULT 'RESERVED',
    "reservedUntil" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundingContribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Funding_receiverId_status_idx" ON "Funding"("receiverId", "status");

-- CreateIndex
CREATE INDEX "Funding_organizerId_status_idx" ON "Funding"("organizerId", "status");

-- CreateIndex
CREATE INDEX "Funding_status_deadline_idx" ON "Funding"("status", "deadline");

-- CreateIndex
CREATE INDEX "FundingContribution_fundingId_status_idx" ON "FundingContribution"("fundingId", "status");

-- CreateIndex
CREATE INDEX "FundingContribution_contributorId_status_idx" ON "FundingContribution"("contributorId", "status");

-- AddForeignKey
ALTER TABLE "Funding" ADD CONSTRAINT "Funding_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Funding" ADD CONSTRAINT "Funding_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Funding" ADD CONSTRAINT "Funding_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Funding" ADD CONSTRAINT "Funding_organizerPaymentMethodId_fkey" FOREIGN KEY ("organizerPaymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingContribution" ADD CONSTRAINT "FundingContribution_fundingId_fkey" FOREIGN KEY ("fundingId") REFERENCES "Funding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingContribution" ADD CONSTRAINT "FundingContribution_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
