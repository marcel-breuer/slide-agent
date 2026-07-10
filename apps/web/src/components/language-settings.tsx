"use client";

/* global HTMLFormElement */

import { Loader2, Save } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactElement } from "react";

import { useUiLocale } from "@/lib/ui-locale";

import { Button, PageHeader, ui } from "./ui";

type Settings = {
  presentationLocale: string;
  timeZone: string;
  uiLocale: string;
};

type SettingsApiResponse =
  { ok: true; data: Settings } | { ok: false; error: { code: string; message: string } };

export function LanguageSettings(): ReactElement {
  const { msg, setLocale } = useUiLocale();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [presentationLocale, setPresentationLocale] = useState("en");
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [timeZone, setTimeZone] = useState("Europe/Berlin");
  const [uiLocale, setUiLocale] = useState("en");

  useEffect(() => {
    async function loadSettings(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/settings");
        const payload = (await response.json()) as SettingsApiResponse;
        if (!response.ok || !payload.ok) {
          setError(payload.ok ? "Settings could not be loaded." : payload.error.message);
          return;
        }
        setPresentationLocale(payload.data.presentationLocale);
        setTimeZone(payload.data.timeZone);
        setUiLocale(payload.data.uiLocale);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Settings could not be loaded.");
      } finally {
        setLoading(false);
      }
    }

    void loadSettings();
  }, []);

  async function saveSettings(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setSaved(false);
    setError(null);

    try {
      const response = await fetch("/api/settings", {
        body: JSON.stringify({
          presentationLocale,
          timeZone,
          uiLocale,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as SettingsApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Settings could not be saved." : payload.error.message);
        return;
      }
      setPresentationLocale(payload.data.presentationLocale);
      setTimeZone(payload.data.timeZone);
      setUiLocale(payload.data.uiLocale);
      if (payload.data.uiLocale === "en" || payload.data.uiLocale === "de") {
        setLocale(payload.data.uiLocale);
      }
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Settings could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={ui.workflowShell}>
      <PageHeader eyebrow={msg("navSettings")} title={msg("language")} />

      <section className={ui.card}>
        {loading ? <p className={ui.empty}>{msg("loadingSettings")}</p> : null}
        {error ? <div className={ui.alert}>{error}</div> : null}
        {saved ? <p className={ui.success}>{msg("saved")}</p> : null}

        <form className={ui.settingsForm} onSubmit={(event) => void saveSettings(event)}>
          <label className={ui.field}>
            <span>{msg("uiLanguage")}</span>
            <select
              className={ui.input}
              value={uiLocale}
              onChange={(event) => setUiLocale(event.target.value)}
            >
              <option value="en">English</option>
              <option value="de">Deutsch</option>
            </select>
          </label>
          <label className={ui.field}>
            <span>{msg("presentationLanguage")}</span>
            <select
              className={ui.input}
              value={presentationLocale}
              onChange={(event) => setPresentationLocale(event.target.value)}
            >
              <option value="en">English</option>
              <option value="de">Deutsch</option>
            </select>
          </label>
          <label className={ui.field}>
            <span>{msg("timeZone")}</span>
            <input
              className={ui.input}
              value={timeZone}
              maxLength={80}
              onChange={(event) => setTimeZone(event.target.value)}
            />
          </label>

          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? (
              <Loader2 size={17} className="animate-spin" aria-hidden="true" />
            ) : (
              <Save size={17} aria-hidden="true" />
            )}
            {msg("saveLanguage")}
          </Button>
        </form>
      </section>
    </section>
  );
}
