"use client";

/* global File, FormData, HTMLInputElement */

import { useRef, useState, type ChangeEvent, type ReactElement } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, FileUp, Loader2 } from "lucide-react";

import { Button, ui } from "./ui";

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
    <section className={ui.pageShell}>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-lg border border-line bg-white p-6 shadow-sm max-[520px]:p-4">
          <div className="mb-5 flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <FileUp size={20} aria-hidden="true" />
            </div>
            <div>
              <h1 className="m-0 text-2xl font-bold leading-tight text-ink">Projects</h1>
              <p className="mt-1 text-sm leading-6 text-muted">
                Upload a PowerPoint deck and convert it into an editable presentation.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-line bg-canvas p-5">
            <input
              ref={inputRef}
              type="file"
              aria-label="PowerPoint file"
              accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              onChange={handleFileChange}
              className="sr-only"
            />
            <div className="flex items-center justify-between gap-4 max-[960px]:flex-col max-[960px]:items-stretch">
              <Button type="button" onClick={() => inputRef.current?.click()}>
                <FileUp size={18} aria-hidden="true" />
                Choose .pptx
              </Button>
              <div className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-muted">
                {file ? <span>{file.name}</span> : "No file selected"}
              </div>
              <Button
                type="button"
                variant="primary"
                disabled={isUploading || !file}
                onClick={() => void uploadSelectedFile()}
              >
                {isUploading ? (
                  <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                ) : null}
                Import
              </Button>
            </div>
          </div>

          {error ? (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle size={18} aria-hidden="true" />
              <p className="m-0">{error}</p>
            </div>
          ) : null}

          {result ? (
            <div className="mt-5 rounded-lg border border-line bg-white p-4">
              <div className="flex items-start justify-between gap-3 max-[960px]:flex-col">
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                    <CheckCircle2 size={18} aria-hidden="true" />
                    Import complete
                  </div>
                  <h2 className="mt-2 text-xl font-bold leading-tight text-ink">{result.title}</h2>
                  <p className="mt-1 text-sm text-muted">{result.fileName}</p>
                </div>
                <a
                  href={result.editorUrl}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-primary bg-white px-3.5 text-sm font-extrabold text-primary no-underline hover:bg-primary hover:text-white"
                >
                  Open editor
                  <ExternalLink size={16} aria-hidden="true" />
                </a>
              </div>

              <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <ReportMetric label="Slides" value={result.report.importedSlideCount} />
                <ReportMetric label="Elements" value={result.report.importedElementCount} />
                <ReportMetric label="Editable" value={result.report.fullyEditableElementCount} />
                <ReportMetric label="Unsupported" value={result.report.unsupportedElementCount} />
              </dl>

              {result.report.warnings.length > 0 ? (
                <div className="mt-4 rounded-lg bg-canvas p-3">
                  <h3 className="m-0 text-sm font-bold text-ink">Import warnings</h3>
                  <ul className="mt-2 pl-5 text-sm leading-6 text-muted">
                    {result.report.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <aside className="rounded-lg border border-line bg-white p-5 shadow-sm max-[520px]:p-4">
          <h2 className="m-0 text-xs font-bold uppercase tracking-wide text-muted">
            Import support
          </h2>
          <dl className="mt-4 grid gap-4">
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
    <div className="rounded-lg border border-line bg-canvas p-3">
      <dt className="text-xs font-bold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-bold leading-tight text-ink">{value}</dd>
    </div>
  );
}

function SupportItem({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div>
      <dt className="text-sm font-bold text-ink">{label}</dt>
      <dd className="mt-1 text-sm leading-6 text-muted">{value}</dd>
    </div>
  );
}
