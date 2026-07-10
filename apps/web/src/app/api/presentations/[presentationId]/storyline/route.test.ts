import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { prisma } from "@slide-agent/database";

import { getAuthenticatedUserId } from "../../../../../lib/server-session";
import { GET, PATCH, POST } from "./route";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    presentation: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    storyline: {
      create: vi.fn(),
    },
    storylineVersion: {
      updateMany: vi.fn(),
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
const mockedUpdateStorylineVersion = prisma.storylineVersion.updateMany as unknown as Mock;

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

  it("persists generated proposal scope estimates", async () => {
    mockedFindPresentation.mockResolvedValue({ id: "presentation-1" });
    mockedCreateStoryline.mockResolvedValue({
      id: "storyline-1",
      name: "Generated review proposal",
      method: "Generated proposal",
      rationale: "Generated from briefing",
      createdAt: new Date("2026-07-09T08:00:00.000Z"),
      versions: [
        {
          id: "version-1",
          version: 1,
          outline: {
            generated: true,
            proposalSummary: "Review proposal",
            sections: [],
            scopeEstimate: { confidence: "high", estimatedMinutes: 9, slideCount: 3 },
          },
          approvedAt: null,
          createdAt: new Date("2026-07-09T08:05:00.000Z"),
        },
      ],
    });
    mockedUpdatePresentation.mockResolvedValue({ count: 1 });

    const response = await POST(
      new Request("http://test.local", {
        body: JSON.stringify({
          generated: true,
          method: "Generated proposal",
          name: "Generated review proposal",
          outline: ["Opening", "Recommendation", "Next steps"],
          proposalSummary: "Review proposal",
          rationale: "Generated from briefing",
          scopeEstimate: { confidence: "high", estimatedMinutes: 9, slideCount: 3 },
        }),
        method: "POST",
      }),
      { params: Promise.resolve({ presentationId: "presentation-1" }) },
    );

    expect(response.status).toBe(201);
    expect(mockedCreateStoryline).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          method: "Generated proposal",
          versions: {
            create: expect.objectContaining({
              outline: expect.objectContaining({
                generated: true,
                proposalSummary: "Review proposal",
                scopeEstimate: { confidence: "high", estimatedMinutes: 9, slideCount: 3 },
              }),
            }),
          },
        }),
      }),
    );
  });

  it("approves a storyline version for the authenticated owner", async () => {
    mockedFindPresentation.mockResolvedValue({
      id: "presentation-1",
      storylines: [{ id: "storyline-1" }],
    });
    mockedUpdateStorylineVersion.mockResolvedValue({ count: 1 });
    mockedUpdatePresentation.mockResolvedValue({ count: 1 });

    const response = await PATCH(
      new Request("http://test.local", {
        body: JSON.stringify({ approved: true, storylineVersionId: "version-1" }),
        method: "PATCH",
      }),
      { params: Promise.resolve({ presentationId: "presentation-1" }) },
    );
    const payload = (await response.json()) as {
      data: { approvedAt: string; storylineVersionId: string };
    };

    expect(response.status).toBe(200);
    expect(payload.data.storylineVersionId).toBe("version-1");
    expect(mockedUpdateStorylineVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "version-1" }),
      }),
    );
    expect(mockedUpdatePresentation).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          activeStorylineVersionId: "version-1",
          status: "APPROVED",
        },
      }),
    );
  });

  it("rejects approval for a storyline version outside the owned presentation", async () => {
    mockedFindPresentation.mockResolvedValue({ id: "presentation-1", storylines: [] });

    const response = await PATCH(
      new Request("http://test.local", {
        body: JSON.stringify({ approved: true, storylineVersionId: "version-1" }),
        method: "PATCH",
      }),
      { params: Promise.resolve({ presentationId: "presentation-1" }) },
    );

    expect(response.status).toBe(404);
    expect(mockedUpdateStorylineVersion).not.toHaveBeenCalled();
  });
});
