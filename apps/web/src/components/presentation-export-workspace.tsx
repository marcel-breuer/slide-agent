"use client";

import { useMemo, useState, type ReactElement } from "react";
import { AlertTriangle, Download, FileDown, Loader2 } from "lucide-react";

import { useUiLocale } from "@/lib/ui-locale";

import { Button, ui } from "./ui";

type ExportSummary = {
  id: string;
  fileName: string;
  byteSize: number | null;
  slideCount: number | null;
  downloadUrl: string;
  createdAt: string;
  settings?: ExportSettings | null;
  warnings?: string[];
};

type ExportSettings = {
  compatibility: "legacy" | "modern" | "strict";
  format: "pptx";
  imageFallbackMode: "preserve-editable" | "rasterize-unsupported";
  includeSpeakerNotes: boolean;
};

type ExportApiResponse =
  { ok: true; data: ExportSummary } | { ok: false; error: { code: string; message: string } };

const defaultExportSettings: ExportSettings = {
  compatibility: "modern",
  format: "pptx",
  imageFallbackMode: "preserve-editable",
  includeSpeakerNotes: true,
};

export function PresentationExportWorkspace({
  archived,
  exports,
  presentationId,
}: {
  archived: boolean;
  exports: ExportSummary[];
  presentationId: string;
}): ReactElement {
  const { msg } = useUiLocale();
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState(exports);
  const [settings, setSettings] = useState<ExportSettings>(defaultExportSettings);
  const [submitting, setSubmitting] = useState(false);
  const warningPreview = useMemo(() => getCompatibilityWarnings(settings), [settings]);

  async function createExport(): Promise<void> {
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(
        `/api/presentations/${encodeURIComponent(presentationId)}/exports`,
        {
          body: JSON.stringify(settings),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const payload = (await response.json()) as ExportApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Export could not be created." : payload.error.message);
        return;
      }
      setItems((current) => [payload.data, ...current]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Export could not be created.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={ui.card}>
      <div className={ui.cardHeader}>
        <div>
          <h2 className={ui.sectionTitle}>PowerPoint exports</h2>
          <p className={ui.muted}>{msg("exportSettingsDescription")}</p>
        </div>
        <Button
          type="button"
          variant="primary"
          disabled={archived || submitting}
          onClick={() => void createExport()}
        >
          {submitting ? (
            <Loader2 size={17} className="animate-spin" aria-hidden="true" />
          ) : (
            <FileDown size={17} aria-hidden="true" />
          )}
          {msg("createExport")}
        </Button>
      </div>

      <div className="mb-4 grid gap-4 rounded-lg border border-line bg-canvas p-4 lg:grid-cols-[1fr_1fr]">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={ui.field}>
            Format
            <select
              className={ui.input}
              value={settings.format}
              onChange={(event) =>
                setSettings((current) => ({ ...current, format: event.target.value as "pptx" }))
              }
            >
              <option value="pptx">PowerPoint (.pptx)</option>
            </select>
          </label>
          <label className={ui.field}>
            Compatibility
            <select
              className={ui.input}
              value={settings.compatibility}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  compatibility: event.target.value as ExportSettings["compatibility"],
                }))
              }
            >
              <option value="modern">Modern PowerPoint</option>
              <option value="strict">Strict editable fallback</option>
              <option value="legacy">Legacy compatibility</option>
            </select>
          </label>
          <label className={ui.field}>
            Fallback handling
            <select
              className={ui.input}
              value={settings.imageFallbackMode}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  imageFallbackMode: event.target.value as ExportSettings["imageFallbackMode"],
                }))
              }
            >
              <option value="preserve-editable">Preserve editable objects</option>
              <option value="rasterize-unsupported">Rasterize unsupported visuals</option>
            </select>
          </label>
          <label className="flex min-h-[42px] items-center gap-3 rounded-lg border border-line bg-white px-3 text-sm font-extrabold text-ink">
            <input
              checked={settings.includeSpeakerNotes}
              className="h-4 w-4 accent-primary"
              type="checkbox"
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  includeSpeakerNotes: event.target.checked,
                }))
              }
            />
            Include speaker notes
          </label>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-muted">
            <AlertTriangle size={15} aria-hidden="true" />
            Compatibility preview
          </div>
          <ul className="grid list-none gap-2 p-0">
            {warningPreview.map((warning) => (
              <li
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900"
                key={warning}
              >
                {warning}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {error ? <div className={ui.alert}>{error}</div> : null}

      {items.length === 0 ? (
        <p className={ui.empty}>{msg("noExportsYet")}</p>
      ) : (
        <ul className={ui.list}>
          {items.map((item) => (
            <li className={ui.item} key={item.id}>
              <div className={ui.itemMain}>
                <div className={ui.itemTitle}>{item.fileName}</div>
                <p className={ui.itemMeta}>
                  {item.slideCount ?? "Unknown"} slides ·{" "}
                  {item.byteSize ? `${Math.round(item.byteSize / 1024)} KB` : "Size pending"} ·{" "}
                  {formatExportDate(item.createdAt)}
                  {item.settings ? ` · ${describeSettings(item.settings)}` : ""}
                </p>
                {item.warnings && item.warnings.length > 0 ? (
                  <ul className="grid list-none gap-1 p-0">
                    {item.warnings.map((warning) => (
                      <li className="text-xs font-bold text-amber-800" key={warning}>
                        {warning}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <a
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-line bg-white px-3.5 text-sm font-extrabold text-ink no-underline hover:border-primary hover:text-primary"
                href={item.downloadUrl}
              >
                <Download size={16} aria-hidden="true" />
                {msg("exportData")}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function getCompatibilityWarnings(settings: ExportSettings): string[] {
  const warnings = ["PowerPoint export can simplify unsupported charts, icons, or stored assets."];

  if (settings.compatibility === "strict") {
    warnings.push("Strict mode prioritizes editable objects and may simplify visual effects.");
  }

  if (settings.compatibility === "legacy") {
    warnings.push("Legacy mode avoids newer PowerPoint features and may flatten advanced styling.");
  }

  if (settings.imageFallbackMode === "rasterize-unsupported") {
    warnings.push("Unsupported visuals may be converted into non-editable images.");
  }

  if (!settings.includeSpeakerNotes) {
    warnings.push("Speaker notes will be excluded from this export.");
  }

  return warnings;
}

function describeSettings(settings: ExportSettings): string {
  return `${settings.compatibility} compatibility, ${
    settings.includeSpeakerNotes ? "notes included" : "notes excluded"
  }`;
}

function formatExportDate(value: string): string {
  return value.replace("T", " ").replace(".000Z", " UTC");
}
