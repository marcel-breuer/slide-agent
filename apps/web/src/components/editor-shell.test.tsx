// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

import { EditorBreadcrumbs, type EditorProjectContext } from "./editor-shell";

afterEach(() => {
  cleanup();
});

describe("EditorBreadcrumbs", () => {
  it("links the editor back to projects and the owning project", () => {
    render(<EditorBreadcrumbs context={createContext()} />);

    expect(screen.getByRole("link", { name: "Projects" }).getAttribute("href")).toBe(
      "/app/projects",
    );
    expect(screen.getByRole("link", { name: "Board reporting" }).getAttribute("href")).toBe(
      "/app/projects/project-1",
    );
    expect(screen.getByText("Q3 board update")).toBeTruthy();
  });
});

function createContext(): EditorProjectContext {
  return {
    outputLanguage: "en",
    presentationTitle: "Q3 board update",
    projectId: "project-1",
    projectName: "Board reporting",
    status: "APPROVED",
  };
}
