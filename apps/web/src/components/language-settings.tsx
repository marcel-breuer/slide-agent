"use client";

/* global HTMLFormElement */

import { Loader2, Save } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactElement } from "react";

type Settings = {
  presentationLocale: string;
  timeZone: string;
  uiLocale: string;
};

type SettingsApiResponse =
  { ok: true; data: Settings } | { ok: false; error: { code: string; message: string } };

export function LanguageSettings(): ReactElement {
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
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Settings could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="workflow-shell">
      <div className="workflow-header">
        <div>
          <p className="workspace-kicker">Settings</p>
          <h1>Language</h1>
        </div>
      </div>

      <section className="workflow-card">
        {loading ? <p className="workspace-empty">Loading settings...</p> : null}
        {error ? <div className="workspace-alert">{error}</div> : null}
        {saved ? <p className="settings-success">Saved</p> : null}

        <form
          className="workflow-form settings-form"
          onSubmit={(event) => void saveSettings(event)}
        >
          <label>
            UI language
            <select value={uiLocale} onChange={(event) => setUiLocale(event.target.value)}>
              <option value="en">English</option>
              <option value="de">Deutsch</option>
            </select>
          </label>
          <label>
            Presentation language
            <select
              value={presentationLocale}
              onChange={(event) => setPresentationLocale(event.target.value)}
            >
              <option value="en">English</option>
              <option value="de">Deutsch</option>
            </select>
          </label>
          <label>
            Time zone
            <input
              value={timeZone}
              maxLength={80}
              onChange={(event) => setTimeZone(event.target.value)}
            />
          </label>

          <button type="submit" className="workspace-button primary" disabled={submitting}>
            {submitting ? (
              <Loader2 size={17} className="import-spin" aria-hidden="true" />
            ) : (
              <Save size={17} aria-hidden="true" />
            )}
            Save language
          </button>
        </form>
      </section>
    </section>
  );
}
