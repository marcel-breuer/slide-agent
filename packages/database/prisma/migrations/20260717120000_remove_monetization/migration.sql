ALTER TABLE "UserSettings"
  DROP COLUMN IF EXISTS "preferredCurrency",
  DROP COLUMN IF EXISTS "monthlyMoneyBudget",
  DROP COLUMN IF EXISTS "monthlyTokenBudget",
  DROP COLUMN IF EXISTS "warningThresholdPercentage",
  DROP COLUMN IF EXISTS "hardStopEnabled",
  DROP COLUMN IF EXISTS "billingPlanCode",
  DROP COLUMN IF EXISTS "billingStatus",
  DROP COLUMN IF EXISTS "billingProvider",
  DROP COLUMN IF EXISTS "billingCustomerId",
  DROP COLUMN IF EXISTS "billingSubscriptionId",
  DROP COLUMN IF EXISTS "billingPeriodStart",
  DROP COLUMN IF EXISTS "billingPeriodEnd",
  DROP COLUMN IF EXISTS "billingCancelAtPeriodEnd",
  DROP COLUMN IF EXISTS "billingGraceUntil",
  DROP COLUMN IF EXISTS "billingStateUpdatedAt";

DROP TABLE IF EXISTS "BillingEvent";
DROP TABLE IF EXISTS "MonthlyUsage";
DROP TABLE IF EXISTS "BudgetReservation";
DROP TABLE IF EXISTS "UsageLedgerEntry";
