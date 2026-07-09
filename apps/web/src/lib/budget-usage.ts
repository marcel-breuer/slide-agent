import { prisma } from "@slide-agent/database";

type DecimalLike = number | string | { toString(): string } | null;

type BudgetSettingsRecord = {
  hardStopEnabled: boolean;
  monthlyMoneyBudget: DecimalLike;
  monthlyTokenBudget: number | null;
  preferredCurrency: string;
  warningThresholdPercentage: number;
};

type AiOperationUsageRecord = {
  estimatedCost: DecimalLike;
  inputTokens: number;
  outputTokens: number;
};

export type BudgetUsageSnapshot = {
  settings: {
    hardStopEnabled: boolean;
    monthlyMoneyBudget: number | null;
    monthlyTokenBudget: number | null;
    preferredCurrency: string;
    warningThresholdPercentage: number;
  };
  usage: {
    estimatedCost: number;
    hardStopReached: boolean;
    inputTokens: number;
    moneyUsagePercentage: number | null;
    monthEnd: string;
    monthStart: string;
    operations: number;
    outputTokens: number;
    remainingMoneyBudget: number | null;
    remainingTokenBudget: number | null;
    tokenUsagePercentage: number | null;
    tokens: number;
    warningReached: boolean;
  };
};

export async function loadBudgetUsageSnapshot(
  userId: string,
  now = new Date(),
): Promise<BudgetUsageSnapshot> {
  const { monthStart, monthEnd } = monthlyWindow(now);
  const [settings, operations] = await Promise.all([
    prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    }),
    prisma.aiOperation.findMany({
      where: {
        ownerId: userId,
        status: "SUCCEEDED",
        createdAt: {
          gte: monthStart,
          lt: monthEnd,
        },
      },
      select: {
        estimatedCost: true,
        inputTokens: true,
        outputTokens: true,
      },
    }),
  ]);

  return buildBudgetUsageSnapshot({ monthEnd, monthStart, operations, settings });
}

export function buildBudgetUsageSnapshot(input: {
  monthEnd: Date;
  monthStart: Date;
  operations: readonly AiOperationUsageRecord[];
  settings: BudgetSettingsRecord;
}): BudgetUsageSnapshot {
  const monthlyMoneyBudget = decimalToNumber(input.settings.monthlyMoneyBudget);
  const monthlyTokenBudget = input.settings.monthlyTokenBudget;
  const estimatedCost = roundCurrency(
    input.operations.reduce((total, operation) => {
      return total + (decimalToNumber(operation.estimatedCost) ?? 0);
    }, 0),
  );
  const inputTokens = input.operations.reduce(
    (total, operation) => total + operation.inputTokens,
    0,
  );
  const outputTokens = input.operations.reduce(
    (total, operation) => total + operation.outputTokens,
    0,
  );
  const tokens = inputTokens + outputTokens;
  const remainingMoneyBudget =
    monthlyMoneyBudget === null ? null : roundCurrency(monthlyMoneyBudget - estimatedCost);
  const remainingTokenBudget = monthlyTokenBudget === null ? null : monthlyTokenBudget - tokens;
  const moneyUsagePercentage = usagePercentage(estimatedCost, monthlyMoneyBudget);
  const tokenUsagePercentage = usagePercentage(tokens, monthlyTokenBudget);
  const warningReached =
    thresholdReached(moneyUsagePercentage, input.settings.warningThresholdPercentage) ||
    thresholdReached(tokenUsagePercentage, input.settings.warningThresholdPercentage);
  const hardStopReached =
    input.settings.hardStopEnabled &&
    ((remainingMoneyBudget !== null && remainingMoneyBudget <= 0) ||
      (remainingTokenBudget !== null && remainingTokenBudget <= 0));

  return {
    settings: {
      hardStopEnabled: input.settings.hardStopEnabled,
      monthlyMoneyBudget,
      monthlyTokenBudget,
      preferredCurrency: input.settings.preferredCurrency,
      warningThresholdPercentage: input.settings.warningThresholdPercentage,
    },
    usage: {
      estimatedCost,
      hardStopReached,
      inputTokens,
      moneyUsagePercentage,
      monthEnd: input.monthEnd.toISOString(),
      monthStart: input.monthStart.toISOString(),
      operations: input.operations.length,
      outputTokens,
      remainingMoneyBudget,
      remainingTokenBudget,
      tokenUsagePercentage,
      tokens,
      warningReached,
    },
  };
}

export function budgetRoutingLimits(snapshot: BudgetUsageSnapshot): {
  remainingBudget: number | null;
  remainingTokens: number | null;
} {
  if (!snapshot.settings.hardStopEnabled) {
    return { remainingBudget: null, remainingTokens: null };
  }

  return {
    remainingBudget:
      snapshot.usage.remainingMoneyBudget === null
        ? null
        : Math.max(0, snapshot.usage.remainingMoneyBudget),
    remainingTokens:
      snapshot.usage.remainingTokenBudget === null
        ? null
        : Math.max(0, snapshot.usage.remainingTokenBudget),
  };
}

export function monthlyWindow(now: Date): { monthStart: Date; monthEnd: Date } {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { monthStart, monthEnd };
}

function decimalToNumber(value: DecimalLike): number | null {
  if (value === null) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function usagePercentage(usage: number, budget: number | null): number | null {
  if (budget === null || budget <= 0) return null;
  return Math.min(999, Math.round((usage / budget) * 1000) / 10);
}

function thresholdReached(usage: number | null, threshold: number): boolean {
  return usage !== null && usage >= threshold;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
