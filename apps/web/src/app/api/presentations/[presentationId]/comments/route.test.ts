import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@slide-agent/database";

import { getAuthenticatedUserId } from "../../../../../lib/server-session";

import { GET, POST } from "./route";

vi.mock("@slide-agent/database", () => ({
  prisma: {
    $transaction: vi.fn(),
    presentation: { findFirst: vi.fn() },
    presentationComment: { count: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("../../../../../lib/server-session", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

const mockedAuth = vi.mocked(getAuthenticatedUserId);
const mockedPresentation = prisma.presentation.findFirst as unknown as {
  mockResolvedValue(value: unknown): void;
};
const mockedFindComments = prisma.presentationComment.findMany as unknown as {
  mockResolvedValue(value: unknown): void;
};
const mockedCountComments = prisma.presentationComment.count as unknown as {
  mockResolvedValue(value: unknown): void;
};

describe("presentation comments API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedAuth.mockResolvedValue("user-1");
    mockedPresentation.mockResolvedValue({ id: "presentation-1" });
    mockedFindComments.mockResolvedValue([]);
    mockedCountComments.mockResolvedValue(0);
  });

  it("requires ownership before exposing comments", async () => {
    mockedPresentation.mockResolvedValue(null);

    const response = await GET(new Request("http://test.local"), {
      params: Promise.resolve({ presentationId: "presentation-1" }),
    });

    expect(response.status).toBe(404);
    expect(prisma.presentationComment.findMany).not.toHaveBeenCalled();
  });

  it("returns the unresolved count for an authorized presentation", async () => {
    const response = await GET(new Request("http://test.local"), {
      params: Promise.resolve({ presentationId: "presentation-1" }),
    });
    const payload = (await response.json()) as {
      data: { comments: unknown[]; unresolvedCount: number };
    };

    expect(response.status).toBe(200);
    expect(payload.data.comments).toEqual([]);
    expect(payload.data.unresolvedCount).toBe(0);
  });

  it("rejects invalid comment input before accessing slide data", async () => {
    const response = await POST(
      new Request("http://test.local", {
        body: JSON.stringify({ body: "", slideId: "slide-1" }),
        method: "POST",
      }),
      { params: Promise.resolve({ presentationId: "presentation-1" }) },
    );

    expect(response.status).toBe(400);
    expect(mockedPresentation).not.toHaveBeenCalled();
  });

  it("rejects mentions outside the authorized workspace owner", async () => {
    mockedPresentation.mockResolvedValue({
      id: "presentation-1",
      ownerId: "user-1",
      slides: [{ document: { elements: [] }, id: "slide-1" }],
    });

    const response = await POST(
      new Request("http://test.local", {
        body: JSON.stringify({
          body: "Please review",
          mentions: ["other-user"],
          slideId: "slide-1",
        }),
        method: "POST",
      }),
      { params: Promise.resolve({ presentationId: "presentation-1" }) },
    );

    expect(response.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
