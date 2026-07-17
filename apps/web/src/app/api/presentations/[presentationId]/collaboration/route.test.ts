import { beforeEach, describe, expect, it, vi } from "vitest";

import { findPresentationDocument, prisma } from "@slide-agent/database";
import { createDemoPresentationDocument } from "@slide-agent/presentation-schema";

import { getAuthenticatedUserId } from "../../../../../lib/server-session";

import { POST } from "./route";

vi.mock("@slide-agent/database", async () => {
  const actual = await vi.importActual("@slide-agent/database");
  return {
    ...actual,
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
      presentationCollaborationOperation: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

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
const mockedFindLatestOperation = prisma.presentationCollaborationOperation
  .findFirst as unknown as {
  mockResolvedValue(value: unknown): void;
};
const mockedTransaction = prisma.$transaction as unknown as {
  mockImplementation<T>(
    implementation: (callback: (transaction: unknown) => Promise<T>) => Promise<T>,
  ): void;
};
const mockedFindOperation = prisma.presentationCollaborationOperation.findUnique as unknown as {
  mockResolvedValue(value: unknown): void;
};
const mockedCreateOperation = prisma.presentationCollaborationOperation.create as unknown as {
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
    mockedFindLatestOperation.mockResolvedValue(null);
    mockedFindOperation.mockResolvedValue(null);
    mockedCreateOperation.mockResolvedValue({
      resultUpdatedAt: new Date("2026-07-13T10:00:01.000Z"),
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

  it("applies an edit command once and returns the authoritative document", async () => {
    const document = createDemoPresentationDocument({ ownerId: "user-1" });
    const updatedAt = new Date("2026-07-13T10:00:01.000Z");
    const existing = {
      ...documentRecord(document, new Date("2026-07-13T10:00:00.000Z")),
    };
    const saved = {
      ...existing,
      title: "Renamed slide deck",
      updatedAt,
    };
    const transaction = {
      presentation: {
        findUnique: vi.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce(saved),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      presentationCollaborationOperation: {
        create: mockedCreateOperation,
        findUnique: mockedFindOperation,
      },
      slide: {
        createMany: vi.fn().mockResolvedValue({ count: document.slides.length }),
        deleteMany: vi.fn().mockResolvedValue({ count: document.slides.length }),
      },
    };
    mockedTransaction.mockImplementation(async (callback) => callback(transaction));

    const response = await POST(
      new Request("http://test.local", {
        body: JSON.stringify({
          clientId: "client-1234567890",
          knownUpdatedAt: "2026-07-13T10:00:00.000Z",
          operation: {
            command: {
              slideId: document.slides[0]?.id,
              title: "Renamed slide deck",
              type: "RENAME_SLIDE",
            },
            operationId: "operation-1234567890",
          },
        }),
        method: "POST",
      }),
      { params: Promise.resolve({ presentationId: document.id }) },
    );
    const payload = (await response.json()) as {
      data: { currentUpdatedAt: string; document: { title: string } };
    };

    expect(response.status).toBe(200);
    expect(payload.data.document.title).toBe("Renamed slide deck");
    expect(payload.data.currentUpdatedAt).toBe(updatedAt.toISOString());
    expect(transaction.presentation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: document.id, updatedAt: existing.updatedAt } }),
    );
  });
});

function documentRecord(
  document: ReturnType<typeof createDemoPresentationDocument>,
  updatedAt: Date,
) {
  return {
    id: document.id,
    ownerId: "user-1",
    title: document.title,
    format: document.format,
    outputLanguage: document.locale,
    designContext: { theme: document.theme },
    createdAt: new Date(document.metadata.createdAt),
    updatedAt,
    slides: document.slides.map((slide) => ({
      id: slide.id,
      order: slide.order,
      document: slide,
    })),
  };
}
