ALTER TABLE "UserSettings"
  ADD COLUMN "billingPlanCode" TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN "billingStatus" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "billingProvider" TEXT,
  ADD COLUMN "billingCustomerId" TEXT,
  ADD COLUMN "billingSubscriptionId" TEXT,
  ADD COLUMN "billingPeriodStart" TIMESTAMP(3),
  ADD COLUMN "billingPeriodEnd" TIMESTAMP(3),
  ADD COLUMN "billingCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "billingGraceUntil" TIMESTAMP(3),
  ADD COLUMN "billingStateUpdatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "UserSettings_billingSubscriptionId_key"
  ON "UserSettings"("billingSubscriptionId");

CREATE TABLE "BillingEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "userId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingEvent_provider_eventId_key"
  ON "BillingEvent"("provider", "eventId");
CREATE INDEX "BillingEvent_userId_occurredAt_idx"
  ON "BillingEvent"("userId", "occurredAt");
