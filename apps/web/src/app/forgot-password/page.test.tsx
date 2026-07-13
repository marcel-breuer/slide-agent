import { describe, expect, it } from "vitest";

import ForgotPasswordPage from "./page";

describe("ForgotPasswordPage", () => {
  it("renders the password recovery surface", () => {
    const page = ForgotPasswordPage();
    expect(page.type).toBe("main");
  });
});
