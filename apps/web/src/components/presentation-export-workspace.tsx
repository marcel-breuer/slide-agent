"use client";

import { useState, type ReactElement } from "react";
import { Download, FileDown, Loader2 } from "lucide-react";

type ExportSummary = {
  id: string;
  fileName: string;
  byteSize: number | null;
  slideCount: number | null;
  downloadUrl: string;
  createdAt: string;
};

type ExportApiResponse =
  | { ok: true; data: ExportSummary }
  | { ok: false; error: { code: string; message: string } };

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
    <section className="workflow-card">
      <div className="workflow-card-header">
        <div>
          <h2>PowerPoint exports</h2>
          <p className="workflow-muted">Generate a downloadable .pptx from the current deck.</p>
        </div>
        <button
          type="button"
          className="workspace-button primary"
          disabled={archived || submitting}
          onClick={() => void createExport()}
        >
          {submitting ? (
            <Loader2 size={17} className="import-spin" aria-hidden="true" />
          ) : (
            <FileDown size={17} aria-hidden="true" />
          )}
          Create export
        </button>
      </div>

      {error ? <div className="workspace-alert">{error}</div> : null}

      {items.length === 0 ? (
        <p className="workspace-empty">No exports yet.</p>
      ) : (
        <ul className="workspace-list">
          {items.map((item) => (
            <li className="workspace-item" key={item.id}>
              <div className="workspace-item-main">
                <div className="workspace-item-title">{item.fileName}</div>
                <p className="workspace-meta">
                  {item.slideCount ?? "Unknown"} slides ·{" "}
                  {item.byteSize ? `${Math.round(item.byteSize / 1024)} KB` : "Size pending"} ·{" "}
                  {new Date(item.createdAt).toLocaleString()}
                </p>
              </div>
              <a className="workspace-button" href={item.downloadUrl}>
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
