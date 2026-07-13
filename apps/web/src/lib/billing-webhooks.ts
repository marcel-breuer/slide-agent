import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { billingStatus, planCode, type BillingStatus, type BillingPlanCode } from "./billing";

const BillingWebhookSchema = z.object({
  createdAt: z.union([z.string().datetime(), z.number().int().positive()]).optional(),
  data: z.object({ object: z.record(z.string(), z.unknown()) }).optional(),
  id: z.string().min(1).max(200),
  type: z.string().min(1).max(160),
});

export type BillingWebhookEvent = {
  eventId: string;
  eventType: string;
  occurredAt: Date;
  payload: {
    billingCustomerId: string | null;
    billingSubscriptionId: string | null;
    cancelAtPeriodEnd: boolean;
    graceUntil: Date | null;
    planCode: BillingPlanCode | null;
    status: BillingStatus | null;
    userId: string | null;
    periodEnd: Date | null;
    periodStart: Date | null;
  };
  safePayload: Record<string, unknown>;
};

export function parseBillingWebhook(body: unknown, now = new Date()): BillingWebhookEvent {
  const parsed = BillingWebhookSchema.parse(body);
  const object = parsed.data?.object ?? {};
  const occurredAt = parseDate(parsed.createdAt) ?? now;
  const plan = stringValue(object.planCode) ?? stringValue(asRecord(object.plan).code);
  const status = stringValue(object.status);
  const periodStart = parseDate(object.periodStart);
  const periodEnd = parseDate(object.periodEnd);
  const graceUntil = parseDate(object.graceUntil);
  const payload = {
    billingCustomerId: stringValue(object.customerId) ?? stringValue(object.billingCustomerId),
    billingSubscriptionId:
      stringValue(object.subscriptionId) ?? stringValue(object.billingSubscriptionId),
    cancelAtPeriodEnd: object.cancelAtPeriodEnd === true,
    graceUntil,
    periodEnd,
    periodStart,
    planCode: plan ? planCode(plan) : null,
    status: status ? billingStatus(status) : null,
    userId: stringValue(object.userId),
  };
  return {
    eventId: parsed.id,
    eventType: parsed.type,
    occurredAt,
    payload,
    safePayload: {
      ...payload,
      graceUntil: graceUntil?.toISOString() ?? null,
      periodEnd: periodEnd?.toISOString() ?? null,
      periodStart: periodStart?.toISOString() ?? null,
    },
  };
}

export function verifyBillingWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
  now = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): boolean {
  if (!signature || !secret) return false;
  const parts = Object.fromEntries(
    signature.split(",").map((part) => {
      const [key, ...value] = part.split("=");
      return [key, value.join("=")];
    }),
  );
  const timestamp = Number(parts.t);
  const signedPayload = Number.isFinite(timestamp) ? `${timestamp}.${rawBody}` : rawBody;
  if (Number.isFinite(timestamp) && Math.abs(now - timestamp) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");
  const actual = parts.v1 ?? signature;
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
