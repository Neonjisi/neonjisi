-- CreateEnum
CREATE TYPE "GiftStatus" AS ENUM ('PENDING', 'PAYING', 'PAID', 'PAYMENT_FAILED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GiftResolution" AS ENUM ('APPROVED', 'COUNTERED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('READY', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethodStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'DELETED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('BIRTHDAY', 'ANNIVERSARY', 'CUSTOM');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'GIFT_REQUEST_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'GIFT_COUNTERED';
ALTER TYPE "NotificationType" ADD VALUE 'GIFT_PAID';
ALTER TYPE "NotificationType" ADD VALUE 'GIFT_PAYMENT_FAILED';
ALTER TYPE "NotificationType" ADD VALUE 'GIFT_CANCELLED_BY_PAYMENT';
ALTER TYPE "NotificationType" ADD VALUE 'GIFT_EXPIRED';

-- AlterTable
ALTER TABLE "TasteItem" ADD COLUMN     "productId" UUID;

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" UUID NOT NULL,
    "price" INTEGER NOT NULL,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "billingKey" TEXT NOT NULL,
    "cardBrand" TEXT NOT NULL,
    "cardLast4" TEXT NOT NULL,
    "status" "PaymentMethodStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftRequest" (
    "id" UUID NOT NULL,
    "giverId" UUID NOT NULL,
    "receiverId" UUID NOT NULL,
    "status" "GiftStatus" NOT NULL DEFAULT 'PENDING',
    "resolution" "GiftResolution",
    "resolvedAt" TIMESTAMP(3),
    "productId" UUID NOT NULL,
    "productSnapshot" JSONB NOT NULL,
    "requestedAmount" INTEGER NOT NULL,
    "counterProductId" UUID,
    "counterProductSnapshot" JSONB,
    "counterAmount" INTEGER,
    "counteredAt" TIMESTAMP(3),
    "finalAmount" INTEGER,
    "receiverDisplayName" TEXT NOT NULL,
    "shippingAddressSnapshot" JSONB,
    "paymentMethodId" UUID NOT NULL,
    "consentAgreedAt" TIMESTAMP(3) NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "respondDueAt" TIMESTAMP(3) NOT NULL,
    "paymentRetryUntil" TIMESTAMP(3),
    "paymentAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerTxId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "giftRequestId" UUID,
    "fundingContributionId" UUID,
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "EventType" NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "isRecurring" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_categoryId_isActive_idx" ON "Product"("categoryId", "isActive");

-- CreateIndex
CREATE INDEX "Product_isActive_price_idx" ON "Product"("isActive", "price");

-- CreateIndex
CREATE INDEX "PaymentMethod_userId_status_idx" ON "PaymentMethod"("userId", "status");

-- CreateIndex
CREATE INDEX "GiftRequest_receiverId_status_respondDueAt_idx" ON "GiftRequest"("receiverId", "status", "respondDueAt");

-- CreateIndex
CREATE INDEX "GiftRequest_giverId_status_idx" ON "GiftRequest"("giverId", "status");

-- CreateIndex
CREATE INDEX "GiftRequest_paymentMethodId_status_idx" ON "GiftRequest"("paymentMethodId", "status");

-- CreateIndex
CREATE INDEX "Payment_giftRequestId_idx" ON "Payment"("giftRequestId");

-- CreateIndex
CREATE INDEX "Event_userId_date_idx" ON "Event"("userId", "date");

-- AddForeignKey
ALTER TABLE "TasteItem" ADD CONSTRAINT "TasteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftRequest" ADD CONSTRAINT "GiftRequest_giverId_fkey" FOREIGN KEY ("giverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftRequest" ADD CONSTRAINT "GiftRequest_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftRequest" ADD CONSTRAINT "GiftRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftRequest" ADD CONSTRAINT "GiftRequest_counterProductId_fkey" FOREIGN KEY ("counterProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftRequest" ADD CONSTRAINT "GiftRequest_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_giftRequestId_fkey" FOREIGN KEY ("giftRequestId") REFERENCES "GiftRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
