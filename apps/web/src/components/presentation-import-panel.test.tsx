// @vitest-environment jsdom
/* global File, FormData */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PresentationImportPanel } from "./presentation-import-panel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PresentationImportPanel", () => {
  it("uploads a selected PowerPoint file and shows the import report", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            id: "import-1",
            presentationId: "presentation-1",
            projectId: "project-demo",
            title: "Q3 Review",
            fileName: "Q3 Review.pptx",
            mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            byteSize: 4096,
            editorUrl: "/app/presentations/presentation-1/editor",
            createdAt: "2026-07-03T10:00:00.000Z",
            report: {
              importedSlideCount: 2,
              importedElementCount: 5,
              fullyEditableElementCount: 4,
              partiallyEditableElementCount: 0,
              unsupportedElementCount: 1,
              warnings: ["One chart requires manual reconstruction."],
            },
          },
        }),
        { status: 201 },
      ),
    );

    render(<PresentationImportPanel projectId="project-demo" />);

    fireEvent.change(screen.getByLabelText("PowerPoint file"), {
      target: {
        files: [
          new File(["pptx"], "Q3 Review.pptx", {
            type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(screen.getByText("Import complete")).toBeTruthy();
    });
    expect(screen.getByRole("heading", { name: "Q3 Review" })).toBeTruthy();
    expect(screen.getByText("One chart requires manual reconstruction.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open editor/ }).getAttribute("href")).toBe(
      "/app/presentations/presentation-1/editor",
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/presentations/imports",
      expect.objectContaining({
        body: expect.any(FormData),
        method: "POST",
      }),
    );
  });

  it("shows API validation errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: { code: "UNSUPPORTED_FILE_TYPE", message: "Upload a .pptx PowerPoint file." },
        }),
        { status: 415 },
      ),
    );

    render(<PresentationImportPanel projectId="project-demo" />);

    fireEvent.change(screen.getByLabelText("PowerPoint file"), {
      target: { files: [new File(["x"], "notes.txt")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(screen.getByText("Upload a .pptx PowerPoint file.")).toBeTruthy();
    });
  });
});
