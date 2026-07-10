"use client";

/* global HTMLFormElement */

import { Loader2, Save } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactElement } from "react";

import { useUiLocale } from "@/lib/ui-locale";

import { Button, PageHeader, ui } from "./ui";

type Settings = {
  defaultAudience: string;
  defaultDetailLevel: string;
  defaultExportCompatibility: string;
  defaultExportFormat: string;
  defaultImageryStyle: string;
  defaultSlideCount: number;
  defaultSpeakerNotes: string;
  defaultTone: string;
  personalMaxSlideCount: number;
};

type SettingsApiResponse =
  { ok: true; data: Settings } | { ok: false; error: { code: string; message: string } };

export function PresentationDefaultsSettings(): ReactElement {
  const { msg } = useUiLocale();
  const [audience, setAudience] = useState("business");
  const [detailLevel, setDetailLevel] = useState("balanced");
  const [error, setError] = useState<string | null>(null);
  const [exportCompatibility, setExportCompatibility] = useState("modern");
  const [exportFormat, setExportFormat] = useState("pptx");
  const [imageryStyle, setImageryStyle] = useState("minimal");
  const [loading, setLoading] = useState(true);
  const [maxSlideCount, setMaxSlideCount] = useState(50);
  const [saved, setSaved] = useState(false);
  const [slideCount, setSlideCount] = useState(10);
  const [speakerNotes, setSpeakerNotes] = useState("talking-points");
  const [submitting, setSubmitting] = useState(false);
  const [tone, setTone] = useState("professional");

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
        applySettings(payload.data);
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
          defaultAudience: audience,
          defaultDetailLevel: detailLevel,
          defaultExportCompatibility: exportCompatibility,
          defaultExportFormat: exportFormat,
          defaultImageryStyle: imageryStyle,
          defaultSlideCount: slideCount,
          defaultSpeakerNotes: speakerNotes,
          defaultTone: tone,
          personalMaxSlideCount: maxSlideCount,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as SettingsApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Settings could not be saved." : payload.error.message);
        return;
      }
      applySettings(payload.data);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Settings could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  function applySettings(settings: Settings): void {
    setAudience(settings.defaultAudience);
    setDetailLevel(settings.defaultDetailLevel);
    setExportCompatibility(settings.defaultExportCompatibility);
    setExportFormat(settings.defaultExportFormat);
    setImageryStyle(settings.defaultImageryStyle);
    setMaxSlideCount(settings.personalMaxSlideCount);
    setSlideCount(settings.defaultSlideCount);
    setSpeakerNotes(settings.defaultSpeakerNotes);
    setTone(settings.defaultTone);
  }

  return (
    <section className={ui.workflowShell}>
      <PageHeader eyebrow={msg("navSettings")} title={msg("presentationDefaults")} />

      <section className={ui.card}>
        {loading ? <p className={ui.empty}>{msg("loadingSettings")}</p> : null}
        {error ? <div className={ui.alert}>{error}</div> : null}
        {saved ? <p className={ui.success}>{msg("saved")}</p> : null}

        <form className={ui.settingsForm} onSubmit={(event) => void saveSettings(event)}>
          <label className={ui.field}>
            <span>{msg("defaultSlides")}</span>
            <input
              className={ui.input}
              type="number"
              min={1}
              max={maxSlideCount}
              value={slideCount}
              onChange={(event) => setSlideCount(Number(event.target.value))}
            />
          </label>
          <label className={ui.field}>
            <span>Maximum slides</span>
            <input
              className={ui.input}
              type="number"
              min={1}
              max={50}
              value={maxSlideCount}
              onChange={(event) => setMaxSlideCount(Number(event.target.value))}
            />
          </label>
          <label className={ui.field}>
            <span>Tone</span>
            <select
              className={ui.input}
              value={tone}
              onChange={(event) => setTone(event.target.value)}
            >
              <option value="professional">Professional</option>
              <option value="executive">Executive</option>
              <option value="persuasive">Persuasive</option>
              <option value="technical">Technical</option>
            </select>
          </label>
          <label className={ui.field}>
            <span>Audience</span>
            <input
              className={ui.input}
              value={audience}
              maxLength={120}
              onChange={(event) => setAudience(event.target.value)}
            />
          </label>
          <label className={ui.field}>
            <span>Detail level</span>
            <select
              className={ui.input}
              value={detailLevel}
              onChange={(event) => setDetailLevel(event.target.value)}
            >
              <option value="concise">Concise</option>
              <option value="balanced">Balanced</option>
              <option value="detailed">Detailed</option>
            </select>
          </label>
          <label className={ui.field}>
            <span>Speaker notes</span>
            <select
              className={ui.input}
              value={speakerNotes}
              onChange={(event) => setSpeakerNotes(event.target.value)}
            >
              <option value="none">None</option>
              <option value="talking-points">Talking points</option>
              <option value="full">Full notes</option>
            </select>
          </label>
          <label className={ui.field}>
            <span>Imagery</span>
            <select
              className={ui.input}
              value={imageryStyle}
              onChange={(event) => setImageryStyle(event.target.value)}
            >
              <option value="none">None</option>
              <option value="minimal">Minimal</option>
              <option value="editorial">Editorial</option>
              <option value="data-driven">Data-driven</option>
            </select>
          </label>
          <label className={ui.field}>
            <span>Export format</span>
            <select
              className={ui.input}
              value={exportFormat}
              onChange={(event) => setExportFormat(event.target.value)}
            >
              <option value="pptx">PowerPoint .pptx</option>
            </select>
          </label>
          <label className={ui.field}>
            <span>Compatibility</span>
            <select
              className={ui.input}
              value={exportCompatibility}
              onChange={(event) => setExportCompatibility(event.target.value)}
            >
              <option value="modern">Modern PowerPoint</option>
              <option value="strict">Strict compatibility</option>
            </select>
          </label>

          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? (
              <Loader2 size={17} className="animate-spin" aria-hidden="true" />
            ) : (
              <Save size={17} aria-hidden="true" />
            )}
            {msg("saveDefaults")}
          </Button>
        </form>
      </section>
    </section>
  );
}
