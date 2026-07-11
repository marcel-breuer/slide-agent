import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("global Tailwind entrypoint", () => {
  it("loads the Tailwind 4 theme configuration before the framework import", () => {
    const stylesheet = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

    expect(stylesheet).toBe('@config "../../tailwind.config.ts";\n@import "tailwindcss";\n');
    expect(stylesheet).not.toContain("@tailwind");
  });
});
