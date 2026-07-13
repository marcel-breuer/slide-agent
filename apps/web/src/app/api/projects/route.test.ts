import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { prisma } from "@slide-agent/database";

import { getAuthenticatedUserId } from "@/lib/server-session";

import { GET, POST } from "./route";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    project: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server-session", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

const mockedCreateProject = prisma.project.create as unknown as Mock;
const mockedFindProjects = prisma.project.findMany as unknown as Mock;
const mockedGetAuthenticatedUserId = vi.mocked(getAuthenticatedUserId);

describe("projects API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetAuthenticatedUserId.mockResolvedValue("user-1");
  });

  it("requires an authenticated session", async () => {
    mockedGetAuthenticatedUserId.mockResolvedValue(null);

    const response = await GET(new Request("http://test.local/api/projects"));
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("UNAUTHORIZED");
    expect(mockedFindProjects).not.toHaveBeenCalled();
  });

  it("lists active user-owned projects by default", async () => {
    mockedFindProjects.mockResolvedValue([
      {
        id: "project-1",
        name: "Board",
        description: null,
        archivedAt: null,
        createdAt: new Date("2026-07-09T08:00:00.000Z"),
        updatedAt: new Date("2026-07-09T09:00:00.000Z"),
        _count: { presentations: 2 },
        presentations: [{ id: "presentation-1" }],
      },
    ]);

    const response = await GET(new Request("http://test.local/api/projects"));
    const payload = (await response.json()) as {
      ok: boolean;
      data: Array<{ activePresentationCount: number; id: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.data[0]).toEqual(
      expect.objectContaining({
        activePresentationCount: 1,
        id: "project-1",
      }),
    );
    expect(mockedFindProjects).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ archivedAt: null, OR: expect.any(Array) }),
      }),
    );
  });

  it("creates a project for the authenticated user", async () => {
    mockedCreateProject.mockResolvedValue({
      id: "project-1",
      name: "Board",
      description: "Monthly reporting",
      archivedAt: null,
      createdAt: new Date("2026-07-09T08:00:00.000Z"),
      updatedAt: new Date("2026-07-09T08:00:00.000Z"),
    });

    const response = await POST(
      new Request("http://test.local/api/projects", {
        body: JSON.stringify({ name: "Board", description: "Monthly reporting" }),
        method: "POST",
      }),
    );
    const payload = (await response.json()) as { ok: boolean; data: { id: string } };

    expect(response.status).toBe(201);
    expect(payload.data.id).toBe("project-1");
    expect(mockedCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerId: "user-1", name: "Board" }),
      }),
    );
  });
});
