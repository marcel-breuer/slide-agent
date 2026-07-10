"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { SupportedLocaleSchema, t, type MessageKey, type SupportedLocale } from "@slide-agent/i18n";

type SettingsApiResponse =
  | { ok: true; data: { uiLocale: string } }
  | { ok: false; error: { code: string; message: string } };

type UiLocaleContextValue = {
  locale: SupportedLocale;
  msg(key: MessageKey): string;
  setLocale(locale: SupportedLocale): void;
};

const UiLocaleContext = createContext<UiLocaleContextValue | null>(null);

export function UiLocaleProvider({
  children,
  initialLocale = "en",
}: {
  children: ReactNode;
  initialLocale?: SupportedLocale;
}) {
  const [locale, setLocale] = useState<SupportedLocale>(initialLocale);

  useEffect(() => {
    let active = true;

    async function loadUiLocale(): Promise<void> {
      try {
        const response = await fetch("/api/settings");
        const payload = (await response.json()) as SettingsApiResponse;
        if (!active || !response.ok || !payload.ok) return;
        const parsed = SupportedLocaleSchema.safeParse(payload.data.uiLocale);
        if (parsed.success) setLocale(parsed.data);
      } catch {
        if (active) setLocale("en");
      }
    }

    void loadUiLocale();
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<UiLocaleContextValue>(
    () => ({
      locale,
      msg: (key) => t(locale, key),
      setLocale,
    }),
    [locale],
  );

  return <UiLocaleContext.Provider value={value}>{children}</UiLocaleContext.Provider>;
}

export function useUiLocale(): UiLocaleContextValue {
  return useContext(UiLocaleContext) ?? fallbackContext;
}

const fallbackContext: UiLocaleContextValue = {
  locale: "en",
  msg: (key) => t("en", key),
  setLocale: () => {},
};
