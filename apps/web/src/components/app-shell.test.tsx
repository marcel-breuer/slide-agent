// @vitest-environment jsdom
/* global HTMLAnchorElement */

import { cleanup, render, screen } from "@testing-library/react";
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
});

describe("AppShell", () => {
  it("renders workspace navigation and marks the current route", () => {
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
    expect(screen.getByRole("link", { name: "AI providers" }).className).toContain("active");
    expect(screen.getByText("Page content")).toBeTruthy();
  });
});
