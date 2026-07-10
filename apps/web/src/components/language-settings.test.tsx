// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UiLocaleProvider } from "@/lib/ui-locale";

import { LanguageSettings } from "./language-settings";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("LanguageSettings", () => {
  it("saves UI language separately from presentation language", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              presentationLocale: "en",
              timeZone: "Europe/Berlin",
              uiLocale: "en",
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              presentationLocale: "en",
              timeZone: "Europe/Berlin",
              uiLocale: "en",
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              presentationLocale: "en",
              timeZone: "Europe/Berlin",
              uiLocale: "de",
            },
          }),
          { status: 200 },
        ),
      );

    render(
      <UiLocaleProvider>
        <LanguageSettings />
      </UiLocaleProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("UI language")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("UI language"), {
      target: { value: "de" },
    });
    fireEvent.change(screen.getByLabelText("Presentation language"), {
      target: { value: "en" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save language" }));

    await waitFor(() => {
      expect(screen.getByText("Gespeichert")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/settings",
      expect.objectContaining({
        body: JSON.stringify({
          presentationLocale: "en",
          timeZone: "Europe/Berlin",
          uiLocale: "de",
        }),
        method: "PATCH",
      }),
    );
  });
});
