import { z } from "zod";

import { prisma } from "@slide-agent/database";

import { fail, ok } from "@/lib/api";
import { loadBillingSnapshot } from "@/lib/billing";
import { getAuthenticatedUserId } from "@/lib/server-session";

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);
  return ok(await loadBillingSnapshot(userId));
}

const BillingActionSchema = z.object({ action: z.enum(["cancel", "reactivate"]) });

export async function PATCH(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Billing action must be valid JSON.", 400);
  }
  const parsed = BillingActionSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Billing action is invalid.", 400);
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { billingSubscriptionId: true },
  });
  if (!settings?.billingSubscriptionId) {
    return fail("BILLING_SUBSCRIPTION_NOT_FOUND", "There is no active billing subscription.", 409);
  }
  await prisma.userSettings.update({
    where: { userId },
    data: { billingCancelAtPeriodEnd: parsed.data.action === "cancel" },
  });
  return ok(await loadBillingSnapshot(userId));
}
