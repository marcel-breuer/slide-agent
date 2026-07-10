// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PresentationBriefingWorkspace } from "./presentation-briefing-workspace";
import { PresentationStorylineWorkspace } from "./presentation-storyline-workspace";
import { PresentationOverview } from "./presentation-workflow-layout";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("presentation generation review workflow", () => {
  it("shows readiness signals on the overview", () => {
    render(<PresentationOverview workflow={createWorkflow()} />);

    expect(screen.getByText("Readiness signals")).toBeTruthy();
    expect(screen.getByText("Briefing approved")).toBeTruthy();
    expect(screen.getByText("Storyline approved")).toBeTruthy();
    expect(screen.getByText("5 slides · 15 minutes")).toBeTruthy();
  });

  it("saves briefing follow-ups, references, and approval state", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            answers: {
              approved: true,
              audience: "Executives",
              followUps: [{ question: "Decision?", answer: "Approve launch." }],
              goal: "Board update",
              references: [{ label: "Market scan", type: "attachment" }],
            },
            updatedAt: "2026-07-10T09:00:00.000Z",
          },
        }),
        { status: 201 },
      ),
    );

    render(
      <PresentationBriefingWorkspace
        archived={false}
        briefing={null}
        presentationId="presentation-1"
      />,
    );

    fireEvent.change(screen.getByLabelText("Goal"), { target: { value: "Board update" } });
    fireEvent.change(screen.getByLabelText("Audience"), { target: { value: "Executives" } });
    fireEvent.change(screen.getByLabelText("Success criteria"), {
      target: { value: "Clear decision" },
    });
    fireEvent.change(screen.getAllByLabelText("Answer")[0]!, {
      target: { value: "Approve launch." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add reference" }));
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Market scan" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "attachment" } });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Approve briefing for storyline generation/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save briefing" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/presentations/presentation-1/briefing",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });
    const request = fetchMock.mock.calls[0]?.[1] as Parameters<typeof fetch>[1];
    if (!request) throw new Error("Expected briefing request init.");
    expect(JSON.parse(String(request.body))).toEqual(
      expect.objectContaining({
        approved: true,
        audience: "Executives",
        followUps: expect.arrayContaining([expect.objectContaining({ answer: "Approve launch." })]),
        references: expect.arrayContaining([
          expect.objectContaining({ label: "Market scan", type: "attachment" }),
        ]),
      }),
    );
  });

  it("generates a storyline proposal and approves it", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: createStoryline({ approvedAt: null, name: "Generated review proposal" }),
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              approvedAt: "2026-07-10T09:10:00.000Z",
              storylineVersionId: "version-1",
            },
          }),
          { status: 200 },
        ),
      );

    render(
      <PresentationStorylineWorkspace
        archived={false}
        presentationId="presentation-1"
        slideTitles={[
          { order: 1, title: "Opening" },
          { order: 2, title: "Recommendation" },
          { order: 3, title: "Next steps" },
        ]}
        storylines={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Generate proposal" }));
    expect(screen.getByDisplayValue("Generated review proposal")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create storyline" }));

    await waitFor(() => {
      expect(screen.getByText("Generated review proposal")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(screen.getByText("Approved")).toBeTruthy();
    });
    const createRequest = fetchMock.mock.calls[0]?.[1] as Parameters<typeof fetch>[1];
    if (!createRequest) throw new Error("Expected storyline create request init.");
    expect(JSON.parse(String(createRequest.body))).toEqual(
      expect.objectContaining({
        method: "Generated proposal",
        scopeEstimate: expect.objectContaining({ slideCount: 3 }),
      }),
    );
    const approveRequest = fetchMock.mock.calls[1]?.[1] as Parameters<typeof fetch>[1];
    if (!approveRequest) throw new Error("Expected storyline approval request init.");
    expect(JSON.parse(String(approveRequest.body))).toEqual({
      approved: true,
      storylineVersionId: "version-1",
    });
  });
});

function createStoryline({
  approvedAt,
  name = "Primary storyline",
}: {
  approvedAt: string | null;
  name?: string;
}) {
  return {
    id: "storyline-1",
    name,
    method: "Generated proposal",
    rationale: "Generated from briefing",
    createdAt: "2026-07-10T09:00:00.000Z",
    latestVersion: {
      approvedAt,
      createdAt: "2026-07-10T09:00:00.000Z",
      generated: true,
      id: "version-1",
      outline: {},
      proposalSummary: "Review proposal",
      scopeEstimate: { confidence: "high", estimatedMinutes: 9, slideCount: 3 },
      version: 1,
    },
  };
}

function createWorkflow(): Parameters<typeof PresentationOverview>[0]["workflow"] {
  return {
    id: "presentation-1",
    title: "Board update",
    description: null,
    status: "APPROVED",
    requestedSlideCount: 5,
    outputLanguage: "en",
    archivedAt: null,
    createdAt: "2026-07-10T08:00:00.000Z",
    updatedAt: "2026-07-10T09:00:00.000Z",
    lastExportAt: null,
    project: { id: "project-1", name: "Board" },
    slideCount: 5,
    slideTitles: [{ id: "slide-1", order: 1, title: "Opening" }],
    briefing: {
      id: "briefing-1",
      answers: {},
      createdAt: "2026-07-10T08:00:00.000Z",
      updatedAt: "2026-07-10T08:10:00.000Z",
      readiness: { approved: true, answeredFollowUps: 2, referenceCount: 1, score: 100 },
    },
    storylines: [
      {
        ...createStoryline({ approvedAt: "2026-07-10T09:00:00.000Z" }),
        latestVersion: {
          ...createStoryline({ approvedAt: "2026-07-10T09:00:00.000Z" }).latestVersion,
          scopeEstimate: { confidence: "high", estimatedMinutes: 15, slideCount: 5 },
        },
      },
    ],
    exports: [],
  };
}
