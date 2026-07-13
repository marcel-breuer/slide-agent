import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import ForgotPasswordPage from "./page";

vi.mock("@/components/simple-route-page", () => ({
  SimpleRoutePage: () => null,
}));

describe("ForgotPasswordPage", () => {
  it("keeps the statically rendered authentication page contract", () => {
    const page = ForgotPasswordPage() as ReactElement<{
      title: string;
      description: string;
    }>;

    expect(page.props.title).toBe("Forgot password");
    expect(page.props.description).toBe("Request a single-use expiring password reset token.");
  });
});
