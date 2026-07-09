import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { prisma } from "@slide-agent/database";

import { getAuthenticatedUserId } from "../../../../../lib/server-session";
import { GET, POST } from "./route";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    presentation: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    storyline: {
      create: vi.fn(),
    },
  },
}));

vi.mock("../../../../../lib/server-session", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

const mockedCreateStoryline = prisma.storyline.create as unknown as Mock;
const mockedFindPresentation = prisma.presentation.findFirst as unknown as Mock;
const mockedGetAuthenticatedUserId = vi.mocked(getAuthenticatedUserId);
const mockedUpdatePresentation = prisma.presentation.updateMany as unknown as Mock;

describe("presentation storyline API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetAuthenticatedUserId.mockResolvedValue("user-1");
  });

  it("lists storylines for the authenticated owner", async () => {
    mockedFindPresentation.mockResolvedValue({
      id: "presentation-1",
      storylines: [
        {
          id: "storyline-1",
          name: "Primary storyline",
          method: "Manual",
          rationale: "Ordered flow",
          createdAt: new Date("2026-07-09T08:00:00.000Z"),
          versions: [
            {
              id: "version-1",
              version: 1,
              outline: { sections: [] },
              approvedAt: null,
              createdAt: new Date("2026-07-09T08:05:00.000Z"),
            },
          ],
        },
      ],
    });

    const response = await GET(new Request("http://test.local"), {
      params: Promise.resolve({ presentationId: "presentation-1" }),
    });
    const payload = (await response.json()) as { data: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(payload.data[0]?.id).toBe("storyline-1");
  });

  it("creates a storyline and marks it active on the presentation", async () => {
    mockedFindPresentation.mockResolvedValue({ id: "presentation-1" });
    mockedCreateStoryline.mockResolvedValue({
      id: "storyline-1",
      name: "Primary storyline",
      method: "Manual",
      rationale: "Ordered flow",
      createdAt: new Date("2026-07-09T08:00:00.000Z"),
      versions: [
        {
          id: "version-1",
          version: 1,
          outline: { sections: [] },
          approvedAt: null,
          createdAt: new Date("2026-07-09T08:05:00.000Z"),
        },
      ],
    });
    mockedUpdatePresentation.mockResolvedValue({ count: 1 });

    const response = await POST(
      new Request("http://test.local", {
        body: JSON.stringify({
          method: "Manual",
          name: "Primary storyline",
          outline: ["Opening", "Recommendation"],
          rationale: "Ordered flow",
        }),
        method: "POST",
      }),
      { params: Promise.resolve({ presentationId: "presentation-1" }) },
    );
    const payload = (await response.json()) as { data: { latestVersion: { id: string } } };

    expect(response.status).toBe(201);
    expect(payload.data.latestVersion.id).toBe("version-1");
    expect(mockedUpdatePresentation).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          activeStorylineVersionId: "version-1",
          status: "STORYLINE_REVIEW",
        },
      }),
    );
  });
});
