// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PresentationCommentsWorkspace } from "./presentation-comments-workspace";

const slides = [{ id: "slide-1", order: 1, title: "Opening" }];

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data, ok: status < 400 }), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

describe("PresentationCommentsWorkspace", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a slide and element anchored comment thread", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response({ comments: [], unresolvedCount: 0 }))
      .mockResolvedValueOnce(response({ id: "comment-1" }, 201))
      .mockResolvedValueOnce(response({ comments: [], unresolvedCount: 1 }));
    render(<PresentationCommentsWorkspace presentationId="presentation-1" slides={slides} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Comment element ID"), {
      target: { value: "title" },
    });
    fireEvent.change(screen.getByLabelText("Comment"), {
      target: { value: "Please tighten this title." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify({
          body: "Please tighten this title.",
          elementId: "title",
          slideId: "slide-1",
        }),
        method: "POST",
      }),
    );
  });

  it("resolves an open thread", async () => {
    const comment = {
      author: { displayName: "Marcel", id: "user-1" },
      authorId: "user-1",
      body: "Needs a source.",
      createdAt: "2026-07-13T10:00:00.000Z",
      deletedAt: null,
      elementId: null,
      events: [],
      id: "comment-1",
      replies: [],
      resolvedAt: null,
      slideId: "slide-1",
      status: "OPEN" as const,
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response({ comments: [comment], unresolvedCount: 1 }))
      .mockResolvedValueOnce(response(comment))
      .mockResolvedValueOnce(response({ comments: [], unresolvedCount: 0 }));
    render(<PresentationCommentsWorkspace presentationId="presentation-1" slides={slides} />);

    const resolveButton = await screen.findByRole("button", { name: "Resolve" });
    fireEvent.click(resolveButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify({ action: "resolve" }),
        method: "PATCH",
      }),
    );
  });
});
