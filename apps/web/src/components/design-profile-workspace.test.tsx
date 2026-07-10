// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DesignProfileWorkspace } from "./design-profile-workspace";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DesignProfileWorkspace", () => {
  it("renders loaded active profiles with usage counts and archive actions", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, data: [createProfile()] }), { status: 200 }),
    );

    render(<DesignProfileWorkspace />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Board brand" })).toBeTruthy();
    });
    expect(screen.getByText("3 uses")).toBeTruthy();
    expect(screen.getByTitle("Archive profile")).toBeTruthy();
  });

  it("creates a manual profile from the form", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: createProfile({ name: "New kit" }) }), {
          status: 201,
        }),
      );

    render(<DesignProfileWorkspace />);

    await waitFor(() => {
      expect(screen.getByText("No active design profiles yet.")).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New kit" } });
    fireEvent.click(screen.getByRole("button", { name: "Create profile" }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "New kit" })).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/design-profiles",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("imports a JSON profile payload", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: createProfile({ name: "Imported kit" }) }), {
          status: 201,
        }),
      );

    render(<DesignProfileWorkspace />);

    fireEvent.change(screen.getByPlaceholderText(/"name":"Brand kit"/), {
      target: {
        value: JSON.stringify({
          name: "Imported kit",
          profile: createProfile().activeVersion?.profile,
          sourceEvidence: ["Imported from a master deck."],
          sourceType: "pptx-master",
        }),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import profile" }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Imported kit" })).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/design-profiles/imports",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

function createProfile(overrides: Partial<ReturnType<typeof baseProfile>> = {}) {
  return { ...baseProfile(), ...overrides };
}

function baseProfile() {
  return {
    id: "profile-1",
    name: "Board brand",
    description: "Executive reporting style",
    sourceType: "manual",
    archivedAt: null,
    updatedAt: "2026-07-10T09:00:00.000Z",
    usageCount: 3,
    activeVersion: {
      version: 2,
      profile: {
        colors: [{ hex: "#0F766E", name: "Primary teal", role: "Primary" }],
        fonts: [{ family: "Inter", role: "Body", weight: "600" }],
        layoutRules: ["Keep headlines short."],
        logos: [{ altText: "Logo", placement: "Footer right" }],
        previewCards: [{ description: "Title layout", title: "Title" }],
        sourceEvidence: ["Imported from board template."],
      },
    },
  };
}
