import { describe, expect, it } from "vitest";

import {
  createSessionCookieValue,
  readSessionTokenFromCookie,
  sanitizeNextPath,
} from "./auth-session";

describe("auth session helpers", () => {
  it("round-trips signed session cookie values", async () => {
    const value = await createSessionCookieValue("raw-token", {
      expiresAt: new Date("2026-07-16T10:00:00.000Z"),
      secret: "test-secret",
    });

    await expect(
      readSessionTokenFromCookie(value, {
        now: new Date("2026-07-09T10:00:00.000Z"),
        secret: "test-secret",
      }),
    ).resolves.toBe("raw-token");
  });

  it("rejects tampered session cookie values", async () => {
    const value = await createSessionCookieValue("raw-token", {
      expiresAt: new Date("2026-07-16T10:00:00.000Z"),
      secret: "test-secret",
    });
    const tampered = value.replace("raw-token", "other-token");

    await expect(
      readSessionTokenFromCookie(tampered, {
        now: new Date("2026-07-09T10:00:00.000Z"),
        secret: "test-secret",
      }),
    ).resolves.toBeNull();
  });

  it("rejects expired session cookie values", async () => {
    const value = await createSessionCookieValue("raw-token", {
      expiresAt: new Date("2026-07-01T10:00:00.000Z"),
      secret: "test-secret",
    });

    await expect(
      readSessionTokenFromCookie(value, {
        now: new Date("2026-07-09T10:00:00.000Z"),
        secret: "test-secret",
      }),
    ).resolves.toBeNull();
  });

  it("sanitizes unsafe next paths", () => {
    expect(sanitizeNextPath("//example.com")).toBe("/app/projects");
    expect(sanitizeNextPath("/api/private")).toBe("/app/projects");
    expect(sanitizeNextPath("/app/projects")).toBe("/app/projects");
  });
});
