// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PresentationExportWorkspace } from "./presentation-export-workspace";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PresentationExportWorkspace", () => {
  it("previews compatibility warnings and sends selected export settings", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            byteSize: 4096,
            createdAt: "2026-07-10T10:00:00.000Z",
            downloadUrl: "/api/presentations/presentation-1/exports/export-1/download",
            fileName: "board-update.pptx",
            id: "export-1",
            settings: {
              compatibility: "legacy",
              format: "pptx",
              imageFallbackMode: "rasterize-unsupported",
              includeSpeakerNotes: false,
            },
            slideCount: 4,
            warnings: ["Speaker notes were excluded from this export."],
          },
        }),
        { status: 201 },
      ),
    );

    render(
      <PresentationExportWorkspace archived={false} exports={[]} presentationId="presentation-1" />,
    );

    fireEvent.change(screen.getByLabelText("Compatibility"), { target: { value: "legacy" } });
    fireEvent.change(screen.getByLabelText("Fallback handling"), {
      target: { value: "rasterize-unsupported" },
    });
    fireEvent.click(screen.getByLabelText("Include speaker notes"));

    expect(screen.getByText(/Legacy mode avoids newer PowerPoint features/)).toBeTruthy();
    expect(screen.getByText(/Unsupported visuals may be converted/)).toBeTruthy();
    expect(screen.getByText("Speaker notes will be excluded from this export.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Create export" }));

    await waitFor(() => {
      expect(screen.getByText("board-update.pptx")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/presentations/presentation-1/exports",
      expect.objectContaining({
        body: JSON.stringify({
          compatibility: "legacy",
          format: "pptx",
          imageFallbackMode: "rasterize-unsupported",
          includeSpeakerNotes: false,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );
  });
});
