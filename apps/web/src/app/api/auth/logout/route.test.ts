import { cookies } from "next/headers";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { createSessionCookieValue } from "@/lib/auth-session";
import { revokeSessionToken } from "@/lib/server-auth-session";

import { POST } from "./route";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@/lib/server-auth-session", () => ({
  revokeSessionToken: vi.fn(),
}));

const mockedCookies = vi.mocked(cookies);
const mockedRevokeSessionToken = vi.mocked(revokeSessionToken);

describe("logout API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("revokes the current session token and clears the cookie", async () => {
    const cookieValue = await createSessionCookieValue("raw-session-token", {
      expiresAt: new Date("2026-07-16T10:00:00.000Z"),
    });
    mockedCookies.mockResolvedValue({ get: () => ({ value: cookieValue }) } as never);

    const response = await POST();
    const payload = (await response.json()) as { ok: boolean; data: { signedOut: boolean } };

    expect(payload).toEqual({ ok: true, data: { signedOut: true } });
    expect(mockedRevokeSessionToken).toHaveBeenCalledWith("raw-session-token");
    expect(response.headers.get("set-cookie")).toContain("slide_agent_session=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
