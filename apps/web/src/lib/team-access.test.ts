import { describe, expect, it } from "vitest";

import { activePresentationScope, activeProjectScope, teamRoleCan } from "./team-access";

describe("team access policy", () => {
  it("enforces the owner, admin, editor, and viewer authorization matrix", () => {
    expect(teamRoleCan("OWNER", "manage")).toBe(true);
    expect(teamRoleCan("ADMIN", "manage")).toBe(true);
    expect(teamRoleCan("EDITOR", "manage")).toBe(false);
    expect(teamRoleCan("EDITOR", "edit")).toBe(true);
    expect(teamRoleCan("VIEWER", "edit")).toBe(false);
    expect(teamRoleCan("VIEWER", "read")).toBe(true);
  });

  it("keeps personal workspaces owner-only while allowing active team members", () => {
    expect(activeProjectScope("user-1")).toEqual({
      OR: [
        { teamId: null, ownerId: "user-1" },
        { team: { members: { some: { revokedAt: null, userId: "user-1" } } } },
      ],
    });
    expect(activePresentationScope("user-1")).toEqual({
      OR: [
        { ownerId: "user-1", project: { teamId: null } },
        { project: { team: { members: { some: { revokedAt: null, userId: "user-1" } } } } },
      ],
    });
  });
});
