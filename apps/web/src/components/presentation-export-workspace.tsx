"use client";

import { useState, type ReactElement } from "react";
import { Download, FileDown, Loader2 } from "lucide-react";

import { Button, ui } from "./ui";

type ExportSummary = {
  id: string;
  fileName: string;
  byteSize: number | null;
  slideCount: number | null;
  downloadUrl: string;
  createdAt: string;
};

type ExportApiResponse =
  { ok: true; data: ExportSummary } | { ok: false; error: { code: string; message: string } };

export function PresentationExportWorkspace({
  archived,
  exports,
  presentationId,
}: {
  archived: boolean;
  exports: ExportSummary[];
  presentationId: string;
}): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState(exports);
  const [submitting, setSubmitting] = useState(false);

  async function createExport(): Promise<void> {
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(
        `/api/presentations/${encodeURIComponent(presentationId)}/exports`,
        {
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
          <p className={ui.muted}>Generate a downloadable .pptx from the current deck.</p>
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
          Create export
        </Button>
      </div>

      {error ? <div className={ui.alert}>{error}</div> : null}

      {items.length === 0 ? (
        <p className={ui.empty}>No exports yet.</p>
      ) : (
        <ul className={ui.list}>
          {items.map((item) => (
            <li className={ui.item} key={item.id}>
              <div className={ui.itemMain}>
                <div className={ui.itemTitle}>{item.fileName}</div>
                <p className={ui.itemMeta}>
                  {item.slideCount ?? "Unknown"} slides ·{" "}
                  {item.byteSize ? `${Math.round(item.byteSize / 1024)} KB` : "Size pending"} ·{" "}
                  {new Date(item.createdAt).toLocaleString()}
                </p>
              </div>
              <a
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-line bg-white px-3.5 text-sm font-extrabold text-ink no-underline hover:border-primary hover:text-primary"
                href={item.downloadUrl}
              >
                <Download size={16} aria-hidden="true" />
                Download
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
