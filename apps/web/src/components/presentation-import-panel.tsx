"use client";

/* global File, FormData, HTMLInputElement */

import { useRef, useState, type ChangeEvent, type ReactElement } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, FileUp, Loader2 } from "lucide-react";

type ImportStatus = "idle" | "ready" | "uploading" | "succeeded" | "failed";

type ImportSummary = {
  id: string;
  presentationId: string;
  projectId: string;
  title: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  editorUrl: string;
  report: {
    importedSlideCount: number;
    importedElementCount: number;
    fullyEditableElementCount: number;
    partiallyEditableElementCount: number;
    unsupportedElementCount: number;
    warnings: string[];
  };
  createdAt: string;
};

type ImportApiResponse =
  { ok: true; data: ImportSummary } | { ok: false; error: { code: string; message: string } };

export function PresentationImportPanel({ projectId }: { projectId: string }): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [status, setStatus] = useState<ImportStatus>("idle");

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const selectedFile = event.target.files?.[0] ?? null;
    setResult(null);
    setError(null);
    setFile(selectedFile);
    setStatus(selectedFile ? "ready" : "idle");
  }

  async function uploadSelectedFile(): Promise<void> {
    if (!file) {
      inputRef.current?.click();
      return;
    }

    setStatus("uploading");
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.set("file", file);
    formData.set("projectId", projectId);

    try {
      const response = await fetch("/api/presentations/imports", {
        body: formData,
        method: "POST",
      });
      const payload = (await response.json()) as ImportApiResponse;

      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "PowerPoint import failed." : payload.error.message);
        setStatus("failed");
        return;
      }

      setResult(payload.data);
      setStatus("succeeded");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "PowerPoint import failed.");
      setStatus("failed");
    }
  }

  const isUploading = status === "uploading";

  return (
    <section className="import-shell">
      <div className="import-layout">
        <div className="import-card">
          <div className="import-heading-row">
            <div className="import-icon">
              <FileUp size={20} aria-hidden="true" />
            </div>
            <div>
              <h1 className="import-title">Projects</h1>
              <p className="import-description">
                Upload a PowerPoint deck and convert it into an editable presentation.
              </p>
            </div>
          </div>

          <div className="import-dropzone">
            <input
              ref={inputRef}
              type="file"
              aria-label="PowerPoint file"
              accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              onChange={handleFileChange}
              className="sr-only"
            />
            <div className="import-controls">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="import-secondary-button"
              >
                <FileUp size={18} aria-hidden="true" />
                Choose .pptx
              </button>
              <div className="import-file-name">
                {file ? <span>{file.name}</span> : "No file selected"}
              </div>
              <button
                type="button"
                disabled={isUploading || !file}
                onClick={() => void uploadSelectedFile()}
                className="import-primary-button"
              >
                {isUploading ? (
                  <Loader2 size={18} className="import-spin" aria-hidden="true" />
                ) : null}
                Import
              </button>
            </div>
          </div>

          {error ? (
            <div className="import-alert">
              <AlertTriangle size={18} aria-hidden="true" />
              <p>{error}</p>
            </div>
          ) : null}

          {result ? (
            <div className="import-result">
              <div className="import-result-header">
                <div>
                  <div className="import-success-label">
                    <CheckCircle2 size={18} aria-hidden="true" />
                    Import complete
                  </div>
                  <h2 className="import-result-title">{result.title}</h2>
                  <p className="import-result-file">{result.fileName}</p>
                </div>
                <a href={result.editorUrl} className="import-editor-link">
                  Open editor
                  <ExternalLink size={16} aria-hidden="true" />
                </a>
              </div>

              <dl className="import-report-grid">
                <ReportMetric label="Slides" value={result.report.importedSlideCount} />
                <ReportMetric label="Elements" value={result.report.importedElementCount} />
                <ReportMetric label="Editable" value={result.report.fullyEditableElementCount} />
                <ReportMetric label="Unsupported" value={result.report.unsupportedElementCount} />
              </dl>

              {result.report.warnings.length > 0 ? (
                <div className="import-warnings">
                  <h3>Import warnings</h3>
                  <ul>
                    {result.report.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <aside className="import-support">
          <h2>Import support</h2>
          <dl>
            <SupportItem label="Accepted file" value=".pptx PowerPoint package" />
            <SupportItem label="Editable output" value="Text-first structured slides" />
            <SupportItem label="Reported gaps" value="Images, charts, tables, groups" />
          </dl>
        </aside>
      </div>
    </section>
  );
}

function ReportMetric({ label, value }: { label: string; value: number }): ReactElement {
  return (
    <div className="import-metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function SupportItem({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="import-support-item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
