import { beforeEach, describe, expect, it, vi } from "vitest";

import { findPresentationDocument, prisma } from "@slide-agent/database";
import { createDemoPresentationDocument } from "@slide-agent/presentation-schema";

import { getAuthenticatedUserId } from "../../../../../lib/server-session";

import { POST } from "./route";

vi.mock("@slide-agent/database", () => ({
  findPresentationDocument: vi.fn(),
  prisma: {
    presentation: {
      findFirst: vi.fn(),
    },
    presentationCollaboratorSession: {
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    userSettings: { upsert: vi.fn() },
  },
}));

vi.mock("../../../../../lib/server-session", () => ({
  getAuthenticatedUserId: vi.fn(),
}));

const mockedGetAuthenticatedUserId = vi.mocked(getAuthenticatedUserId);
const mockedFindPresentationDocument = vi.mocked(findPresentationDocument);
const mockedFindPresentation = prisma.presentation.findFirst as unknown as {
  mockResolvedValue(value: unknown): void;
};
const mockedDeleteSessions = prisma.presentationCollaboratorSession.deleteMany as unknown as {
  mockResolvedValue(value: unknown): void;
};
const mockedUpsertSession = prisma.presentationCollaboratorSession.upsert as unknown as {
  mockResolvedValue(value: unknown): void;
};
const mockedFindSessions = prisma.presentationCollaboratorSession.findMany as unknown as {
  mockResolvedValue(value: unknown): void;
};
const mockedSettingsUpsert = prisma.userSettings.upsert as unknown as {
  mockResolvedValue(value: unknown): void;
};

describe("presentation collaboration API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetAuthenticatedUserId.mockResolvedValue("user-1");
    mockedFindPresentation.mockResolvedValue({
      id: "presentation-1",
      updatedAt: new Date("2026-07-13T10:00:00.000Z"),
    });
    mockedDeleteSessions.mockResolvedValue({ count: 0 });
    mockedUpsertSession.mockResolvedValue({});
    mockedFindSessions.mockResolvedValue([
      {
        clientId: "client-1234567890",
        id: "session-1",
        lastSeenAt: new Date("2026-07-13T10:00:00.000Z"),
        selectedSlideId: "slide-1",
        user: { displayName: "Marcel", email: "marcel@example.com", id: "user-1" },
      },
    ]);
    mockedSettingsUpsert.mockResolvedValue({
      billingCancelAtPeriodEnd: false,
      billingGraceUntil: null,
      billingPeriodEnd: null,
      billingPeriodStart: null,
      billingPlanCode: "free",
      billingStatus: "active",
    });
  });

  it("requires an authenticated session", async () => {
    mockedGetAuthenticatedUserId.mockResolvedValue(null);

    const response = await POST(
      new Request("http://test.local", {
        body: JSON.stringify({
          clientId: "client-1234567890",
          knownUpdatedAt: "2026-07-13T10:00:00.000Z",
        }),
        method: "POST",
      }),
      { params: Promise.resolve({ presentationId: "presentation-1" }) },
    );

    expect(response.status).toBe(401);
    expect(mockedFindPresentation).not.toHaveBeenCalled();
  });

  it("records a session and returns active collaborators without reloading an unchanged document", async () => {
    const response = await POST(
      new Request("http://test.local", {
        body: JSON.stringify({
          clientId: "client-1234567890",
          knownUpdatedAt: "2026-07-13T10:00:00.000Z",
          selectedSlideId: "slide-1",
        }),
        method: "POST",
      }),
      { params: Promise.resolve({ presentationId: "presentation-1" }) },
    );
    const payload = (await response.json()) as {
      data: { collaborators: Array<{ displayName: string }>; document: unknown };
    };

    expect(response.status).toBe(200);
    expect(payload.data.collaborators[0]?.displayName).toBe("Marcel");
    expect(payload.data.document).toBeNull();
    expect(mockedUpsertSession).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          clientId: "client-1234567890",
          presentationId: "presentation-1",
          selectedSlideId: "slide-1",
          userId: "user-1",
        }),
      }),
    );
  });

  it("returns a newer document so a saved editor can converge after a remote update", async () => {
    const document = createDemoPresentationDocument({ ownerId: "user-1" });
    mockedFindPresentation.mockResolvedValue({
      id: document.id,
      updatedAt: new Date(document.metadata.updatedAt),
    });
    mockedFindPresentationDocument.mockResolvedValue(document);

    const response = await POST(
      new Request("http://test.local", {
        body: JSON.stringify({
          clientId: "client-1234567890",
          knownUpdatedAt: "2026-07-13T09:59:00.000Z",
        }),
        method: "POST",
      }),
      { params: Promise.resolve({ presentationId: document.id }) },
    );
    const payload = (await response.json()) as {
      data: { document: { id: string } };
    };

    expect(response.status).toBe(200);
    expect(payload.data.document.id).toBe(document.id);
    expect(mockedFindPresentationDocument).toHaveBeenCalledWith(prisma, document.id);
  });
});
