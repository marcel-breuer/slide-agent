import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { prisma } from "@slide-agent/database";

import { getAuthenticatedUserId } from "@/lib/server-session";

import { GET, PATCH } from "./route";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    project: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server-session", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

const mockedFindProject = prisma.project.findFirst as unknown as Mock;
const mockedUpdateProject = prisma.project.updateMany as unknown as Mock;
const mockedGetAuthenticatedUserId = vi.mocked(getAuthenticatedUserId);

describe("project detail API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetAuthenticatedUserId.mockResolvedValue("user-1");
  });

  it("returns project presentations for the authenticated owner", async () => {
    mockedFindProject.mockResolvedValue({
      id: "project-1",
      name: "Board",
      description: null,
      archivedAt: null,
      createdAt: new Date("2026-07-09T08:00:00.000Z"),
      updatedAt: new Date("2026-07-09T08:30:00.000Z"),
      presentations: [
        {
          id: "presentation-1",
          title: "Q3 Review",
          status: "EDITING",
          requestedSlideCount: 10,
          archivedAt: null,
          createdAt: new Date("2026-07-09T08:05:00.000Z"),
          updatedAt: new Date("2026-07-09T08:10:00.000Z"),
        },
      ],
    });

    const response = await GET(new Request("http://test.local"), {
      params: Promise.resolve({ projectId: "project-1" }),
    });
    const payload = (await response.json()) as {
      data: { presentations: Array<{ editorUrl: string }> };
    };

    expect(response.status).toBe(200);
    expect(payload.data.presentations[0]?.editorUrl).toBe(
      "/app/presentations/presentation-1/editor",
    );
    expect(mockedFindProject).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "project-1", OR: expect.any(Array) }) }),
    );
  });

  it("archives a project for the authenticated owner", async () => {
    mockedUpdateProject.mockResolvedValue({ count: 1 });
    mockedFindProject.mockResolvedValue({
      id: "project-1",
      name: "Board",
      description: null,
      archivedAt: new Date("2026-07-09T09:00:00.000Z"),
      createdAt: new Date("2026-07-09T08:00:00.000Z"),
      updatedAt: new Date("2026-07-09T09:00:00.000Z"),
    });

    const response = await PATCH(
      new Request("http://test.local", {
        body: JSON.stringify({ archived: true }),
        method: "PATCH",
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );
    const payload = (await response.json()) as { data: { archivedAt: string | null } };

    expect(response.status).toBe(200);
    expect(payload.data.archivedAt).toBe("2026-07-09T09:00:00.000Z");
    expect(mockedUpdateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "project-1" },
      }),
    );
  });

  it("returns not found when the owner update touches no rows", async () => {
    mockedUpdateProject.mockResolvedValue({ count: 0 });

    const response = await PATCH(
      new Request("http://test.local", {
        body: JSON.stringify({ name: "Other" }),
        method: "PATCH",
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("PROJECT_NOT_FOUND");
  });
});
