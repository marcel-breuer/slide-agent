import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { parseBillingWebhook, verifyBillingWebhookSignature } from "./billing-webhooks";

describe("billing webhook boundaries", () => {
  it("verifies timestamped signatures and rejects stale or altered payloads", () => {
    const body = JSON.stringify({ id: "evt-1", type: "subscription.updated" });
    const timestamp = 1_752_444_800;
    const signature = createHmac("sha256", "webhook-secret")
      .update(`${timestamp}.${body}`)
      .digest("hex");
    expect(verifyBillingWebhookSignature(body, `t=${timestamp},v1=${signature}`, "webhook-secret", timestamp)).toBe(true);
    expect(verifyBillingWebhookSignature(`${body}x`, `t=${timestamp},v1=${signature}`, "webhook-secret", timestamp)).toBe(false);
    expect(verifyBillingWebhookSignature(body, `t=${timestamp},v1=${signature}`, "webhook-secret", timestamp + 301)).toBe(false);
  });

  it("normalizes only safe billing fields from provider payloads", () => {
    const event = parseBillingWebhook({
      createdAt: "2026-07-13T12:00:00.000Z",
      data: {
        object: {
          cancelAtPeriodEnd: false,
          customerId: "cus-1",
          planCode: "pro",
          periodEnd: "2026-08-13T12:00:00.000Z",
          periodStart: "2026-07-13T12:00:00.000Z",
          secretPaymentCredential: "must-not-be-stored",
          subscriptionId: "sub-1",
          userId: "user-1",
        },
      },
      id: "evt-1",
      type: "subscription.updated",
    });

    expect(event.payload).toMatchObject({ billingCustomerId: "cus-1", planCode: "pro", userId: "user-1" });
    expect(event.safePayload).not.toHaveProperty("secretPaymentCredential");
    expect(event.occurredAt.toISOString()).toBe("2026-07-13T12:00:00.000Z");
  });
});
