// @vitest-environment jsdom
/* global HTMLAnchorElement, window */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProfileSettings } from "./profile-settings";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ProfileSettings", () => {
  it("loads and saves account profile preferences", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: createProfile() }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: createProfile({
              displayName: "Updated User",
              timeZone: "America/New_York",
            }),
          }),
          { status: 200 },
        ),
      );

    render(<ProfileSettings />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("user@example.com")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Updated User" },
    });
    fireEvent.change(screen.getByLabelText("Time zone"), {
      target: { value: "America/New_York" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(screen.getByText("Profile saved.")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/settings/profile",
      expect.objectContaining({
        body: JSON.stringify({
          displayName: "Updated User",
          timeZone: "America/New_York",
        }),
        method: "PATCH",
      }),
    );
  });

  it("keeps deletion disabled until the account email is typed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, data: createProfile() }), { status: 200 }),
    );

    render(<ProfileSettings />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Delete account" })).toBeTruthy();
    });
    const button = screen.getByRole("button", { name: "Delete account" });
    expect(button).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByLabelText("Confirm email"), {
      target: { value: "user@example.com" },
    });

    expect(button).toHaveProperty("disabled", false);
  });

  it("requests account export without exposing it in form state", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const createObjectUrlMock = vi.fn(() => "blob:account-export");
    const revokeObjectUrlMock = vi.fn();
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrlMock,
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrlMock,
    });
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: createProfile() }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ generatedAt: "now" }), { status: 200 }));

    render(<ProfileSettings />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Export data" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Export data" }));

    await waitFor(() => {
      expect(screen.getByText("Account export is ready.")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/settings/profile/export");
    expect(createObjectUrlMock).toHaveBeenCalled();
    expect(revokeObjectUrlMock).toHaveBeenCalledWith("blob:account-export");
  });
});

function createProfile(overrides: Partial<ProfileForTest> = {}): ProfileForTest {
  return {
    createdAt: "2026-07-01T08:00:00.000Z",
    displayName: "Example User",
    email: "user@example.com",
    id: "user-1",
    timeZone: "Europe/Berlin",
    updatedAt: "2026-07-10T08:00:00.000Z",
    ...overrides,
  };
}

type ProfileForTest = {
  createdAt: string;
  displayName: string | null;
  email: string;
  id: string;
  timeZone: string;
  updatedAt: string;
};
