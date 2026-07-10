import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { prisma } from "@slide-agent/database";

import { getAuthenticatedUserId } from "../../../../../lib/server-session";
import { GET, POST } from "./route";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    briefing: {
      create: vi.fn(),
    },
    presentation: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("../../../../../lib/server-session", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

const mockedCreateBriefing = prisma.briefing.create as unknown as Mock;
const mockedFindPresentation = prisma.presentation.findFirst as unknown as Mock;
const mockedGetAuthenticatedUserId = vi.mocked(getAuthenticatedUserId);
const mockedUpdatePresentation = prisma.presentation.updateMany as unknown as Mock;

describe("presentation briefing API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetAuthenticatedUserId.mockResolvedValue("user-1");
  });

  it("returns the latest briefing for the authenticated owner", async () => {
    mockedFindPresentation.mockResolvedValue({
      id: "presentation-1",
      briefings: [
        {
          id: "briefing-1",
          answers: { goal: "Board update", audience: "Executives" },
          createdAt: new Date("2026-07-09T08:00:00.000Z"),
          updatedAt: new Date("2026-07-09T09:00:00.000Z"),
        },
      ],
    });

    const response = await GET(new Request("http://test.local"), {
      params: Promise.resolve({ presentationId: "presentation-1" }),
    });
    const payload = (await response.json()) as { data: { id: string } };

    expect(response.status).toBe(200);
    expect(payload.data.id).toBe("briefing-1");
    expect(mockedFindPresentation).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "presentation-1", ownerId: "user-1" } }),
    );
  });

  it("creates a briefing and moves the presentation into briefing status", async () => {
    mockedFindPresentation.mockResolvedValue({ id: "presentation-1" });
    mockedCreateBriefing.mockResolvedValue({
      id: "briefing-1",
      answers: { goal: "Board update", audience: "Executives" },
      createdAt: new Date("2026-07-09T08:00:00.000Z"),
      updatedAt: new Date("2026-07-09T09:00:00.000Z"),
    });
    mockedUpdatePresentation.mockResolvedValue({ count: 1 });

    const response = await POST(
      new Request("http://test.local", {
        body: JSON.stringify({
          audience: "Executives",
          goal: "Board update",
        }),
        method: "POST",
      }),
      { params: Promise.resolve({ presentationId: "presentation-1" }) },
    );
    const payload = (await response.json()) as { data: { id: string } };

    expect(response.status).toBe(201);
    expect(payload.data.id).toBe("briefing-1");
    expect(mockedCreateBriefing).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ presentationId: "presentation-1" }),
      }),
    );
    expect(mockedUpdatePresentation).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "BRIEFING" } }),
    );
  });

  it("persists adaptive follow-ups, references, and approval readiness", async () => {
    mockedFindPresentation.mockResolvedValue({ id: "presentation-1" });
    mockedCreateBriefing.mockResolvedValue({
      id: "briefing-1",
      answers: {
        approved: true,
        audience: "Executives",
        followUps: [{ question: "Decision?", answer: "Approve launch." }],
        goal: "Board update",
        readiness: { approved: true, answeredFollowUps: 1, referenceCount: 1, score: 83 },
        references: [{ label: "Market scan", type: "attachment" }],
      },
      createdAt: new Date("2026-07-09T08:00:00.000Z"),
      updatedAt: new Date("2026-07-09T09:00:00.000Z"),
    });
    mockedUpdatePresentation.mockResolvedValue({ count: 1 });

    const response = await POST(
      new Request("http://test.local", {
        body: JSON.stringify({
          approved: true,
          audience: "Executives",
          followUps: [{ question: "Decision?", answer: "Approve launch." }],
          goal: "Board update",
          references: [{ label: "Market scan", type: "attachment" }],
          requirements: "Show risks",
          successCriteria: "Clear approval ask",
        }),
        method: "POST",
      }),
      { params: Promise.resolve({ presentationId: "presentation-1" }) },
    );
    const payload = (await response.json()) as {
      data: { answers: { readiness: { approved: boolean } } };
    };

    expect(response.status).toBe(201);
    expect(payload.data.answers.readiness.approved).toBe(true);
    expect(mockedCreateBriefing).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          answers: expect.objectContaining({
            approved: true,
            followUps: [{ answer: "Approve launch.", question: "Decision?" }],
            readiness: expect.objectContaining({
              answeredFollowUps: 1,
              referenceCount: 1,
            }),
            references: [{ label: "Market scan", type: "attachment" }],
          }),
        }),
      }),
    );
    expect(mockedUpdatePresentation).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "STORYLINE_REVIEW" } }),
    );
  });

  it("rejects briefing changes for another user's presentation", async () => {
    mockedFindPresentation.mockResolvedValue(null);

    const response = await POST(
      new Request("http://test.local", {
        body: JSON.stringify({
          audience: "Executives",
          goal: "Board update",
        }),
        method: "POST",
      }),
      { params: Promise.resolve({ presentationId: "presentation-1" }) },
    );

    expect(response.status).toBe(404);
    expect(mockedCreateBriefing).not.toHaveBeenCalled();
  });
});
