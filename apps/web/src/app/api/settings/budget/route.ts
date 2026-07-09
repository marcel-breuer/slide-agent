import { z } from "zod";

import { prisma } from "@slide-agent/database";
import type { Prisma } from "@slide-agent/database";

import { fail, ok } from "@/lib/api";
import { loadBudgetUsageSnapshot } from "@/lib/budget-usage";
import { getAuthenticatedUserId } from "@/lib/server-session";

const BudgetSettingsSchema = z.object({
  hardStopEnabled: z.boolean().optional(),
  monthlyMoneyBudget: z.number().finite().min(0).max(1_000_000).nullable().optional(),
  monthlyTokenBudget: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  warningThresholdPercentage: z.number().int().min(1).max(100).optional(),
});
type BudgetSettingsInput = z.infer<typeof BudgetSettingsSchema>;

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  return ok(await loadBudgetUsageSnapshot(userId));
}

export async function PATCH(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }

  const parsed = BudgetSettingsSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Budget settings input is invalid.", 400);

  await prisma.userSettings.upsert({
    where: { userId },
    update: toBudgetSettingsUpdateData(parsed.data),
    create: {
      userId,
      ...toBudgetSettingsCreateData(parsed.data),
    },
  });

  return ok(await loadBudgetUsageSnapshot(userId));
}

function toBudgetSettingsUpdateData(data: BudgetSettingsInput): Prisma.UserSettingsUpdateInput {
  const updateData: Prisma.UserSettingsUpdateInput = {};

  if (data.hardStopEnabled !== undefined) updateData.hardStopEnabled = data.hardStopEnabled;
  if (data.monthlyMoneyBudget !== undefined) {
    updateData.monthlyMoneyBudget = data.monthlyMoneyBudget;
  }
  if (data.monthlyTokenBudget !== undefined)
    updateData.monthlyTokenBudget = data.monthlyTokenBudget;
  if (data.warningThresholdPercentage !== undefined) {
    updateData.warningThresholdPercentage = data.warningThresholdPercentage;
  }

  return updateData;
}

function toBudgetSettingsCreateData(
  data: BudgetSettingsInput,
): Omit<Prisma.UserSettingsUncheckedCreateInput, "id" | "userId"> {
  const createData: Omit<Prisma.UserSettingsUncheckedCreateInput, "id" | "userId"> = {};

  if (data.hardStopEnabled !== undefined) createData.hardStopEnabled = data.hardStopEnabled;
  if (data.monthlyMoneyBudget !== undefined) {
    createData.monthlyMoneyBudget = data.monthlyMoneyBudget;
  }
  if (data.monthlyTokenBudget !== undefined)
    createData.monthlyTokenBudget = data.monthlyTokenBudget;
  if (data.warningThresholdPercentage !== undefined) {
    createData.warningThresholdPercentage = data.warningThresholdPercentage;
  }

  return createData;
}
