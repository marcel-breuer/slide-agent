// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReusableAssetWorkspace } from "./reusable-asset-workspace";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ReusableAssetWorkspace", () => {
  it("renders active reusable assets with version and usage metadata", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, data: [createAsset()] }), { status: 200 }),
    );

    render(<ReusableAssetWorkspace />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Board kit" })).toBeTruthy();
    });
    expect(screen.getByText("Brand kit · v2 · 3 uses")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Archive" })).toBeTruthy();
  });

  it("creates a reusable asset from the form", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: createAsset({ name: "New template" }) }), {
          status: 201,
        }),
      );

    render(<ReusableAssetWorkspace />);

    await waitFor(() => {
      expect(screen.getByText("No active reusable assets yet.")).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New template" } });
    fireEvent.click(screen.getByRole("button", { name: "Create asset" }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "New template" })).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/templates",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

function createAsset(overrides: { name?: string } = {}) {
  return {
    id: "asset-1",
    name: overrides.name ?? "Board kit",
    description: "Executive reporting style",
    kind: "BRAND_KIT",
    sourceType: "manual",
    archivedAt: null,
    updatedAt: "2026-07-10T09:00:00.000Z",
    usageCount: 3,
    activeVersion: {
      version: 2,
      compatibilityWarnings: [],
      definition: {
        profile: {
          colors: [],
          fonts: [],
          layoutRules: [],
          logos: [],
          previewCards: [],
          sourceEvidence: [],
        },
        slides: [],
      },
    },
  };
}
