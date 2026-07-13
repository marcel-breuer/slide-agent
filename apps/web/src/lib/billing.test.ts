import { describe, expect, it } from "vitest";

import {
  PLAN_ENTITLEMENTS,
  billingAccess,
  billingPeriod,
  evaluateQuota,
  planCode,
} from "./billing";

describe("billing entitlements", () => {
  it("uses the free plan for unknown or missing plan codes", () => {
    expect(planCode("unknown")).toBe("free");
    expect(PLAN_ENTITLEMENTS.free.maxPresentations).toBe(3);
  });

  it("enforces quota boundaries without allowing an overage", () => {
    expect(evaluateQuota("exports", 9, 10, 1)).toEqual({ allowed: true, remaining: 1 });
    expect(evaluateQuota("exports", 10, 10, 1)).toEqual({ allowed: false, remaining: 0 });
    expect(evaluateQuota("exports", 10, 10, 0)).toEqual({ allowed: true, remaining: 0 });
  });

  it("allows failed payments during the grace period and limits them afterwards", () => {
    const now = new Date("2026-07-13T12:00:00.000Z");
    expect(billingAccess("past_due", new Date("2026-07-14T12:00:00.000Z"), now)).toBe("grace");
    expect(billingAccess("past_due", new Date("2026-07-12T12:00:00.000Z"), now)).toBe("limited");
    expect(billingAccess("active", null, now)).toBe("active");
  });

  it("creates UTC monthly quota periods", () => {
    expect(billingPeriod(new Date("2026-07-13T23:00:00.000Z"))).toEqual({
      periodEnd: new Date("2026-08-01T00:00:00.000Z"),
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
    });
  });
});
