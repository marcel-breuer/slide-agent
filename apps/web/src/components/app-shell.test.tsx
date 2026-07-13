// @vitest-environment jsdom
/* global HTMLAnchorElement */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import React, { type AnchorHTMLAttributes, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/settings/providers",
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AppShell", () => {
  it("renders workspace navigation and marks the current route", () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("not loaded"));

    render(
      <AppShell>
        <section>Page content</section>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "Projects" }).getAttribute("href")).toBe(
      "/app/projects",
    );
    expect(screen.getByRole("link", { name: "Design profiles" }).getAttribute("href")).toBe(
      "/app/design-profiles",
    );
    expect(screen.getByRole("link", { name: "Templates & kits" }).getAttribute("href")).toBe(
      "/app/templates",
    );
    expect(screen.getByRole("link", { name: "AI providers" }).className).toContain("active");
    expect(screen.getByText("Page content")).toBeTruthy();
  });

  it("applies the persisted UI locale to navigation copy", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            uiLocale: "de",
          },
        }),
        { status: 200 },
      ),
    );

    render(
      <AppShell>
        <section>Page content</section>
      </AppShell>,
    );

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "KI-Anbieter" })).toBeTruthy();
    });
    expect(screen.getByRole("link", { name: "Projekte" }).getAttribute("href")).toBe(
      "/app/projects",
    );
    expect(screen.getAllByText("Arbeitsbereich").length).toBeGreaterThan(0);
  });
});
