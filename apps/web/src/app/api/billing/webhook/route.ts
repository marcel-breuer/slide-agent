import { randomUUID } from "node:crypto";

import { prisma } from "@slide-agent/database";
import type { Prisma } from "@slide-agent/database";

import { fail, ok } from "@/lib/api";
import { parseBillingWebhook, verifyBillingWebhookSignature } from "@/lib/billing-webhooks";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const secret = process.env.BILLING_WEBHOOK_SECRET;
  if (!secret) return fail("BILLING_WEBHOOK_NOT_CONFIGURED", "Billing webhooks are not configured.", 503);
  if (!verifyBillingWebhookSignature(rawBody, request.headers.get("x-billing-signature"), secret)) {
    return fail("BILLING_WEBHOOK_UNAUTHORIZED", "Billing webhook signature is invalid.", 401);
  }

  let event;
  try {
    event = parseBillingWebhook(JSON.parse(rawBody));
  } catch {
    return fail("BILLING_WEBHOOK_INVALID", "Billing webhook payload is invalid.", 400);
  }

  const provider = request.headers.get("x-billing-provider")?.trim() || "generic";
  try {
    const existing = await prisma.billingEvent.findUnique({
      where: { provider_eventId: { eventId: event.eventId, provider } },
      select: { id: true, status: true },
    });
    if (existing) return ok({ duplicate: true, eventId: event.eventId, status: existing.status });

    const identifiers = [
      ...(event.payload.userId ? [{ userId: event.payload.userId }] : []),
      ...(event.payload.billingCustomerId ? [{ billingCustomerId: event.payload.billingCustomerId }] : []),
      ...(event.payload.billingSubscriptionId ? [{ billingSubscriptionId: event.payload.billingSubscriptionId }] : []),
    ];
    const settings = identifiers.length
      ? await prisma.userSettings.findFirst({
          where: { OR: identifiers },
          select: {
            billingStateUpdatedAt: true,
            billingPlanCode: true,
            billingStatus: true,
            billingGraceUntil: true,
            billingCancelAtPeriodEnd: true,
            billingCustomerId: true,
            billingSubscriptionId: true,
            billingPeriodStart: true,
            billingPeriodEnd: true,
            userId: true,
          },
        })
      : null;
    const userId = settings?.userId ?? event.payload.userId;
    const ignored = !settings || Boolean(settings.billingStateUpdatedAt && event.occurredAt < settings.billingStateUpdatedAt);
    await prisma.billingEvent.create({
      data: {
        id: randomUUID(),
        eventId: event.eventId,
        eventType: event.eventType,
        occurredAt: event.occurredAt,
        payload: event.safePayload as Prisma.InputJsonValue,
        processedAt: new Date(),
        provider,
        status: ignored ? (settings ? "IGNORED_OUT_OF_ORDER" : "IGNORED_UNKNOWN_USER") : "PROCESSED",
        userId,
      },
    });
    if (!settings || ignored) return ok({ eventId: event.eventId, ignored: true });

    await prisma.userSettings.update({
      where: { userId: settings.userId },
      data: billingSettingsUpdate(event, settings),
    });
    return ok({ eventId: event.eventId, processed: true });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return ok({ duplicate: true, eventId: event.eventId });
    }
    return fail("BILLING_WEBHOOK_FAILED", "Billing webhook could not be processed.", 500);
  }
}

function billingSettingsUpdate(
  event: ReturnType<typeof parseBillingWebhook>,
  current: { billingPlanCode: string; billingStatus: string; billingGraceUntil: Date | null },
) {
  const type = event.eventType;
  const isPaymentFailure = type === "invoice.payment_failed";
  const isPaymentSuccess = type === "invoice.paid";
  const isCanceled = type === "subscription.canceled" || type === "customer.subscription.deleted";
  const status = isPaymentFailure
    ? "past_due"
    : isPaymentSuccess
      ? "active"
      : isCanceled
        ? "canceled"
        : event.payload.status ?? current.billingStatus;
  const graceUntil = isPaymentFailure
    ? event.payload.graceUntil ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    : isPaymentSuccess
      ? null
      : isCanceled
        ? event.payload.periodEnd ?? current.billingGraceUntil
        : event.payload.graceUntil ?? current.billingGraceUntil;
  const update: {
    billingCancelAtPeriodEnd: boolean;
    billingGraceUntil: Date | null;
    billingPlanCode: string;
    billingStateUpdatedAt: Date;
    billingStatus: string;
    billingCustomerId?: string;
    billingPeriodEnd?: Date;
    billingPeriodStart?: Date;
    billingSubscriptionId?: string;
  } = {
    billingCancelAtPeriodEnd: isCanceled ? true : event.payload.cancelAtPeriodEnd,
    billingGraceUntil: graceUntil,
    billingPlanCode: event.payload.planCode ?? current.billingPlanCode,
    billingStateUpdatedAt: event.occurredAt,
    billingStatus: status,
  };
  if (event.payload.billingCustomerId) update.billingCustomerId = event.payload.billingCustomerId;
  if (event.payload.periodEnd) update.billingPeriodEnd = event.payload.periodEnd;
  if (event.payload.periodStart) update.billingPeriodStart = event.payload.periodStart;
  if (event.payload.billingSubscriptionId) update.billingSubscriptionId = event.payload.billingSubscriptionId;
  return update;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
