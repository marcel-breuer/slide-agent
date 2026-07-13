import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { prisma } from "@slide-agent/database";
import { getAuthenticatedUserId } from "@/lib/server-session";
import { DELETE } from "./route";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    teamInvitation: { updateMany: vi.fn() },
    teamMembership: { findFirst: vi.fn() },
    teamMembershipAuditLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/server-session", () => ({ getAuthenticatedUserId: vi.fn() }));

const membership = prisma.teamMembership.findFirst as unknown as Mock;
const invitationUpdate = prisma.teamInvitation.updateMany as unknown as Mock;
const auditCreate = prisma.teamMembershipAuditLog.create as unknown as Mock;
const session = vi.mocked(getAuthenticatedUserId);

describe("team invitation revocation API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    session.mockResolvedValue("admin-1");
    membership.mockResolvedValue({ id: "membership-1", role: "ADMIN", teamId: "team-1", userId: "admin-1" });
    invitationUpdate.mockResolvedValue({ count: 1 });
  });

  it("revokes a pending invitation and records the audit event", async () => {
    const response = await DELETE(new Request("http://test.local", { method: "DELETE" }), {
      params: Promise.resolve({ invitationId: "invitation-1", teamId: "team-1" }),
    });

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ id: "invitation-1", status: "REVOKED" });
    expect(invitationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "invitation-1", status: "PENDING", teamId: "team-1" },
        data: expect.objectContaining({ status: "REVOKED" }),
      }),
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "INVITATION_REVOKED" }) }),
    );
  });
});
