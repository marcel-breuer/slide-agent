import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { prisma } from "@slide-agent/database";

import { POST } from "./route";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    billingEvent: { create: vi.fn(), findUnique: vi.fn() },
    userSettings: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

const mockedEventFindUnique = prisma.billingEvent.findUnique as unknown as Mock;
const mockedEventCreate = prisma.billingEvent.create as unknown as Mock;
const mockedSettingsFindFirst = prisma.userSettings.findFirst as unknown as Mock;
const mockedSettingsUpdate = prisma.userSettings.update as unknown as Mock;

describe("billing webhook API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.BILLING_WEBHOOK_SECRET = "webhook-secret";
    mockedEventFindUnique.mockResolvedValue(null);
    mockedEventCreate.mockResolvedValue({ id: "billing-event-1" });
    mockedSettingsFindFirst.mockResolvedValue({
      billingCancelAtPeriodEnd: false,
      billingCustomerId: "cus-1",
      billingGraceUntil: null,
      billingPeriodEnd: null,
      billingPeriodStart: null,
      billingPlanCode: "free",
      billingStateUpdatedAt: null,
      billingStatus: "active",
      billingSubscriptionId: "sub-1",
      userId: "user-1",
    });
    mockedSettingsUpdate.mockResolvedValue({});
  });

  it("rejects unsigned or tampered billing events", async () => {
    const body = JSON.stringify({ id: "evt-1", type: "subscription.updated" });
    const response = await POST(
      new Request("http://test.local", { body, method: "POST" }),
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("BILLING_WEBHOOK_UNAUTHORIZED");
    expect(mockedEventCreate).not.toHaveBeenCalled();
  });

  it("processes a verified event and stores only its safe projection", async () => {
    const body = JSON.stringify({
      createdAt: "2026-07-13T12:00:00.000Z",
      data: {
        object: {
          customerId: "cus-1",
          planCode: "pro",
          secretPaymentCredential: "never-store",
          subscriptionId: "sub-1",
        },
      },
      id: "evt-1",
      type: "subscription.updated",
    });
    const signature = createHmac("sha256", "webhook-secret").update(body).digest("hex");
    const response = await POST(
      new Request("http://test.local", {
        body,
        headers: { "x-billing-signature": `v1=${signature}`, "x-billing-provider": "test" },
        method: "POST",
      }),
    );
    const payload = (await response.json()) as { data: { processed: boolean } };

    expect(response.status).toBe(200);
    expect(payload.data.processed).toBe(true);
    expect(mockedEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventId: "evt-1", status: "PROCESSED" }),
      }),
    );
    expect(mockedEventCreate.mock.calls[0]?.[0].data.payload).not.toHaveProperty(
      "secretPaymentCredential",
    );
    expect(mockedSettingsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ billingPlanCode: "pro" }) }),
    );
  });

  it("treats duplicate events as idempotent and stale events as no-ops", async () => {
    mockedEventFindUnique.mockResolvedValueOnce({ id: "billing-event-1", status: "PROCESSED" });
    const duplicateBody = JSON.stringify({ id: "evt-1", type: "invoice.paid" });
    const duplicateSignature = createHmac("sha256", "webhook-secret").update(duplicateBody).digest("hex");
    const duplicateResponse = await POST(
      new Request("http://test.local", {
        body: duplicateBody,
        headers: { "x-billing-signature": `v1=${duplicateSignature}` },
        method: "POST",
      }),
    );
    expect((await duplicateResponse.json()).data.duplicate).toBe(true);
    expect(mockedSettingsUpdate).not.toHaveBeenCalled();

    mockedEventFindUnique.mockResolvedValue(null);
    mockedSettingsFindFirst.mockResolvedValue({
      billingCancelAtPeriodEnd: false,
      billingGraceUntil: null,
      billingPlanCode: "pro",
      billingStateUpdatedAt: new Date("2026-07-14T00:00:00.000Z"),
      billingStatus: "active",
      userId: "user-1",
    });
    const staleBody = JSON.stringify({
      createdAt: "2026-07-13T12:00:00.000Z",
      id: "evt-stale",
      type: "subscription.updated",
    });
    const staleSignature = createHmac("sha256", "webhook-secret").update(staleBody).digest("hex");
    const staleResponse = await POST(
      new Request("http://test.local", {
        body: staleBody,
        headers: { "x-billing-signature": `v1=${staleSignature}` },
        method: "POST",
      }),
    );
    expect((await staleResponse.json()).data.ignored).toBe(true);
    expect(mockedSettingsUpdate).not.toHaveBeenCalled();
  });
});
