// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SecuritySettings } from "./security-settings";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SecuritySettings", () => {
  it("loads sessions and sends confirmed password changes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: createSnapshot() }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: { updated: true } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: createSnapshot({ auditEvents: [] }) }), {
          status: 200,
        }),
      );

    render(<SecuritySettings />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Active sessions" })).toBeTruthy();
    });
    expect(screen.getByText("Session session-")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "CurrentPassword!123" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "NewPassword!123" },
    });
    fireEvent.change(screen.getByLabelText("Repeat new password"), {
      target: { value: "NewPassword!123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => {
      expect(screen.getByText("Password changed.")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/settings/security",
      expect.objectContaining({
        body: JSON.stringify({
          confirmation: "CHANGE_PASSWORD",
          currentPassword: "CurrentPassword!123",
          newPassword: "NewPassword!123",
        }),
        method: "PATCH",
      }),
    );
  });

  it("requires matching new password fields before enabling password changes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, data: createSnapshot() }), { status: 200 }),
    );

    render(<SecuritySettings />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Password" })).toBeTruthy();
    });

    const button = screen.getByRole("button", { name: "Change password" });
    expect(button).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "CurrentPassword!123" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "NewPassword!123" },
    });
    fireEvent.change(screen.getByLabelText("Repeat new password"), {
      target: { value: "DifferentPassword!123" },
    });

    expect(button).toHaveProperty("disabled", true);
    expect(screen.getByText("New passwords must match.")).toBeTruthy();
  });

  it("sends explicit confirmation when revoking a session", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: createSnapshot() }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: { revoked: true } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: createSnapshot({ sessions: [] }) }), {
          status: 200,
        }),
      );

    render(<SecuritySettings />);

    await waitFor(() => {
      expect(screen.getByText("Session session-")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() => {
      expect(screen.getByText("Session revoked.")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/settings/security/sessions/session-current",
      expect.objectContaining({
        body: JSON.stringify({ confirmation: "REVOKE_SESSION" }),
        method: "DELETE",
      }),
    );
  });
});

function createSnapshot(overrides: Partial<SecuritySnapshotForTest> = {}): SecuritySnapshotForTest {
  return {
    auditEvents: [
      {
        action: "security.password_changed",
        createdAt: "2026-07-10T07:30:00.000Z",
        id: "audit-1",
        metadata: {},
      },
    ],
    currentSessionId: "session-current",
    sessions: [
      {
        createdAt: "2026-07-10T07:00:00.000Z",
        current: true,
        expiresAt: "2026-07-17T07:00:00.000Z",
        id: "session-current",
        rotatedAt: null,
      },
    ],
    ...overrides,
  };
}

type SecuritySnapshotForTest = {
  auditEvents: Array<{
    action: string;
    createdAt: string;
    id: string;
    metadata: unknown;
  }>;
  currentSessionId: string;
  sessions: Array<{
    createdAt: string;
    current: boolean;
    expiresAt: string;
    id: string;
    rotatedAt: string | null;
  }>;
};
