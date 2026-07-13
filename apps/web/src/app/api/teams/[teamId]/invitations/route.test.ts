import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { prisma } from "@slide-agent/database";
import { getAuthenticatedUserId } from "@/lib/server-session";
import { POST } from "./route";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    teamInvitation: { create: vi.fn(), findFirst: vi.fn() },
    teamMembership: { findFirst: vi.fn() },
    teamMembershipAuditLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/server-session", () => ({ getAuthenticatedUserId: vi.fn() }));

const membership = prisma.teamMembership.findFirst as unknown as Mock;
const invitationFind = prisma.teamInvitation.findFirst as unknown as Mock;
const invitationCreate = prisma.teamInvitation.create as unknown as Mock;
const auditCreate = prisma.teamMembershipAuditLog.create as unknown as Mock;
const session = vi.mocked(getAuthenticatedUserId);

describe("team invitation API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    session.mockResolvedValue("owner-1");
    membership
      .mockResolvedValueOnce({ id: "membership-1", role: "OWNER", teamId: "team-1", userId: "owner-1" })
      .mockResolvedValue(null);
    invitationFind.mockResolvedValue(null);
    invitationCreate.mockResolvedValue({
      id: "invitation-1",
      email: "editor@example.com",
      role: "EDITOR",
      status: "PENDING",
      expiresAt: new Date("2026-07-20T00:00:00.000Z"),
    });
  });

  it("creates a hashed, expiring invitation for a permitted role", async () => {
    const response = await POST(
      new Request("http://test.local", {
        body: JSON.stringify({ email: "Editor@Example.com", role: "EDITOR" }),
        method: "POST",
      }),
      { params: Promise.resolve({ teamId: "team-1" }) },
    );
    const payload = (await response.json()) as { ok: boolean; data: { token: string } };

    expect(response.status).toBe(201);
    expect(payload.ok).toBe(true);
    expect(payload.data.token).toHaveLength(43);
    expect(invitationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "editor@example.com",
          tokenHash: expect.not.stringContaining(payload.data.token),
        }),
      }),
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "INVITATION_CREATED" }) }),
    );
    expect(createHash("sha256").update(payload.data.token).digest("hex")).toBe(
      invitationCreate.mock.calls[0]?.[0]?.data.tokenHash,
    );
  });

  it("rejects duplicate pending invitations", async () => {
    invitationFind.mockResolvedValue({ id: "existing" });
    const response = await POST(
      new Request("http://test.local", {
        body: JSON.stringify({ email: "editor@example.com", role: "EDITOR" }),
        method: "POST",
      }),
      { params: Promise.resolve({ teamId: "team-1" }) },
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("INVITATION_EXISTS");
    expect(invitationCreate).not.toHaveBeenCalled();
  });
});
