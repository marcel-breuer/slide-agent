import { cookies } from "next/headers";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { findPresentationDocument, ensureDemoPresentation } from "@slide-agent/database";
import { createDemoPresentationDocument } from "@slide-agent/presentation-schema";

import { POST } from "./route";

vi.mock("next/headers", () => ({
  cookies: vi.fn()
}));

vi.mock("@slide-agent/database", () => ({
  ensureDemoPresentation: vi.fn(),
  findPresentationDocument: vi.fn(),
  prisma: {}
}));

const mockedCookies = vi.mocked(cookies);
const mockedEnsureDemoPresentation = vi.mocked(ensureDemoPresentation);
const mockedFindPresentationDocument = vi.mocked(findPresentationDocument);

describe("AI edit proposals API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedEnsureDemoPresentation.mockResolvedValue("demo-presentation");
  });

  it("requires an authenticated session", async () => {
    mockedCookies.mockResolvedValue({ get: () => undefined } as never);

    const response = await POST(new Request("http://test.local"), {
      params: Promise.resolve({ presentationId: "demo-presentation" })
    });
    const payload = (await response.json()) as { ok: boolean; error: { code: string } };

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("UNAUTHORIZED");
    expect(mockedFindPresentationDocument).not.toHaveBeenCalled();
  });

  it("returns a deterministic proposal for pointer-guided input", async () => {
    const document = createDemoPresentationDocument({ now: "2026-07-02T12:00:00.000Z" });
    mockedCookies.mockResolvedValue({ get: () => ({ value: "session" }) } as never);
    mockedFindPresentationDocument.mockResolvedValue(document);

    const response = await POST(
      new Request("http://test.local", {
        body: JSON.stringify({
          document,
          pointers: [
            {
              id: "pointer-1",
              instruction: "Use a calmer background",
              label: "1",
              slideId: "slide-1",
              x: 240,
              y: 180
            }
          ],
          prompt: "Use #f8fafc near pointer 1.",
          slideId: "slide-1"
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      }),
      {
        params: Promise.resolve({ presentationId: "demo-presentation" })
      }
    );
    const payload = (await response.json()) as {
      ok: boolean;
      data: {
        commands: Array<{ command: { type: string; color?: string } }>;
        pointerIds: string[];
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.pointerIds).toEqual(["pointer-1"]);
    expect(payload.data.commands[0]?.command).toEqual({
      color: "#f8fafc",
      slideId: "slide-1",
      type: "UPDATE_SLIDE_BACKGROUND"
    });
  });
});
