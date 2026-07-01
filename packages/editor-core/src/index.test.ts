import { describe, expect, it } from "vitest";

import { buildSlidePointerContext, createSlidePointer } from "./index";

describe("slide pointers", () => {
  it("clamps pointer coordinates to the logical slide bounds", () => {
    const pointer = createSlidePointer({
      id: "pointer-1",
      slideId: "slide-1",
      x: 1200,
      y: -40,
      instruction: "Change the headline"
    });

    expect(pointer).toMatchObject({
      id: "pointer-1",
      slideId: "slide-1",
      x: 1000,
      y: 0,
      instruction: "Change the headline"
    });
  });

  it("builds focused AI context for one slide", () => {
    const context = buildSlidePointerContext("slide-1", [
      createSlidePointer({
        id: "pointer-1",
        slideId: "slide-1",
        x: 250,
        y: 281.25,
        instruction: "Make this number more prominent"
      }),
      createSlidePointer({
        id: "pointer-2",
        slideId: "slide-2",
        x: 100,
        y: 100,
        instruction: "Ignore other slides"
      })
    ]);

    expect(context).toBe("Slide AI pointers:\n1. pointer 1 at x 25%, y 50%: Make this number more prominent");
  });
});
