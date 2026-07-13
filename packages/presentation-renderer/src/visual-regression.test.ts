import { describe, expect, it } from "vitest";

import { createDemoPresentationDocument } from "@slide-agent/presentation-schema";

import {
  compareVisualBaselines,
  createVisualBaseline,
  DEFAULT_VISUAL_VIEWPORT,
} from "./visual-regression";

describe("visual regression baselines", () => {
  it("is deterministic despite volatile presentation metadata", () => {
    const first = createVisualBaseline(
      "core-elements",
      createDemoPresentationDocument({ now: "2026-07-13T10:00:00.000Z" }),
    );
    const second = createVisualBaseline(
      "core-elements",
      createDemoPresentationDocument({ now: "2026-07-14T11:00:00.000Z" }),
    );

    expect(first.fingerprint).toBe(second.fingerprint);
    expect(compareVisualBaselines(first, second).passed).toBe(true);
  });

  it("detects an intentional visual change and produces a diff artifact", () => {
    const expected = createVisualBaseline("core-elements", createDemoPresentationDocument());
    const changedDocument = createDemoPresentationDocument();
    changedDocument.slides[0]!.background.color = "#f8fafc";
    const actual = createVisualBaseline("core-elements", changedDocument);

    const diff = compareVisualBaselines(expected, actual);

    expect(diff.passed).toBe(false);
    expect(diff.changedLines).toBeGreaterThan(0);
    expect(diff.artifact).toContain("expected fingerprint:");
    expect(diff.artifact).toContain("actual fingerprint:");
  });

  it("uses the fixed product viewport by default", () => {
    const baseline = createVisualBaseline("core-elements", createDemoPresentationDocument());

    expect({ width: baseline.width, height: baseline.height }).toEqual(DEFAULT_VISUAL_VIEWPORT);
  });
});
