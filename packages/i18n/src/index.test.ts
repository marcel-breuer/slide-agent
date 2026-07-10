import { describe, expect, it } from "vitest";

import { getMessages, t } from "./index";

describe("i18n messages", () => {
  it("returns translated app copy for supported locales", () => {
    expect(t("en", "navProjects")).toBe("Projects");
    expect(t("de", "navProjects")).toBe("Projekte");
  });

  it("falls back predictably for complete message maps", () => {
    const messages = getMessages("de");

    expect(messages.navProjects).toBe("Projekte");
    expect(Object.keys(messages)).toContain("profileSettings");
  });
});
