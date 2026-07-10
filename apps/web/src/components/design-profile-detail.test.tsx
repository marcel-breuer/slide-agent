// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DesignProfileDetail } from "./design-profile-detail";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DesignProfileDetail", () => {
  it("renders design evidence, rules, preview cards, and version history", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, data: createDetailProfile() }), { status: 200 }),
    );

    render(<DesignProfileDetail profileId="profile-1" />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Board brand" })).toBeTruthy();
    });
    expect(screen.getByText("Primary teal")).toBeTruthy();
    expect(screen.getByText("Body · Inter · 600")).toBeTruthy();
    expect(screen.getByText("Imported from board template.")).toBeTruthy();
    expect(screen.getByText("Version 2")).toBeTruthy();
    expect(screen.getByText("Title layout")).toBeTruthy();
  });

  it("archives the loaded profile", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: createDetailProfile() }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: createDetailProfile({ archivedAt: "2026-07-10T10:00:00.000Z" }),
          }),
          { status: 200 },
        ),
      );

    render(<DesignProfileDetail profileId="profile-1" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Archive profile" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Archive profile" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Restore profile" })).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/design-profiles/profile-1",
      expect.objectContaining({
        body: JSON.stringify({ archived: true }),
        method: "PATCH",
      }),
    );
  });
});

function createDetailProfile(overrides: Partial<DetailProfileForTest> = {}): DetailProfileForTest {
  return {
    id: "profile-1",
    name: "Board brand",
    description: "Executive reporting style",
    sourceType: "manual",
    sourceEvidence: { items: ["Imported from board template."], sourceType: "manual" },
    archivedAt: null,
    usageCount: 3,
    activeVersion: {
      version: 2,
      createdAt: "2026-07-10T09:00:00.000Z",
      profile: {
        colors: [{ hex: "#0F766E", name: "Primary teal", role: "Primary" }],
        fonts: [{ family: "Inter", role: "Body", weight: "600" }],
        layoutRules: ["Keep headlines short."],
        logos: [{ altText: "Logo", placement: "Footer right" }],
        previewCards: [{ description: "Title layout", title: "Title" }],
        sourceEvidence: ["Imported from board template."],
      },
    },
    versions: [{ version: 2, createdAt: "2026-07-10T09:00:00.000Z" }],
    ...overrides,
  };
}

type DetailProfileForTest = {
  id: string;
  name: string;
  description: string | null;
  sourceType: string;
  sourceEvidence: { items: string[]; sourceType: string };
  archivedAt: string | null;
  usageCount: number;
  activeVersion: {
    version: number;
    createdAt: string;
    profile: {
      colors: Array<{ hex: string; name: string; role: string }>;
      fonts: Array<{ family: string; role: string; weight: string }>;
      layoutRules: string[];
      logos: Array<{ altText: string; placement: string }>;
      previewCards: Array<{ description: string; title: string }>;
      sourceEvidence: string[];
    };
  };
  versions: Array<{ version: number; createdAt: string }>;
};
