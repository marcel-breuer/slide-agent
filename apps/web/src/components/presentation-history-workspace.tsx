"use client";

import { useEffect, useState, type ReactElement } from "react";

import { Button, ui } from "./ui";

type Version = {
  actor: { displayName: string; id: string } | null;
  changeSummary: string | null;
  createdAt: string;
  id: string;
  source: string;
  version: number;
};

export function PresentationHistoryWorkspace({
  presentationId,
  updatedAt,
}: {
  presentationId: string;
  updatedAt: string;
}): ReactElement {
  const [versions, setVersions] = useState<Version[]>([]);
  const [currentUpdatedAt, setCurrentUpdatedAt] = useState(updatedAt);
  const [preview, setPreview] = useState<{ version: Version; changedSlides: number } | null>(null);
  const [summary, setSummary] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadVersions();
  }, [presentationId]);

  async function loadVersions(): Promise<void> {
    try {
      const response = await fetch(
        `/api/presentations/${encodeURIComponent(presentationId)}/versions`,
      );
      const payload = (await response.json()) as { ok: boolean; data?: { versions: Version[] } };
      if (response.ok && payload.ok && payload.data) setVersions(payload.data.versions);
    } catch {
      setMessage("Version history could not be loaded.");
    }
  }

  async function createRestorePoint(): Promise<void> {
    const response = await fetch(
      `/api/presentations/${encodeURIComponent(presentationId)}/versions`,
      {
        body: JSON.stringify({ changeSummary: summary, source: "manual" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    if (!response.ok) {
      setMessage("Restore point could not be created.");
      return;
    }
    setSummary("");
    setMessage("Restore point created.");
    await loadVersions();
  }

  async function previewVersion(version: Version): Promise<void> {
    const response = await fetch(
      `/api/presentations/${encodeURIComponent(presentationId)}/versions/${encodeURIComponent(version.id)}`,
    );
    const payload = (await response.json()) as {
      ok: boolean;
      data?: {
        current: { metadata: { updatedAt: string }; slides: unknown[] };
        version: { document: { slides?: unknown[] } };
      };
    };
    if (!response.ok || !payload.ok || !payload.data) return;
    setCurrentUpdatedAt(payload.data.current.metadata.updatedAt);
    setPreview({
      changedSlides: payload.data.version.document.slides?.length ?? 0,
      version,
    });
  }

  async function restoreVersion(): Promise<void> {
    if (!preview) return;
    const response = await fetch(
      `/api/presentations/${encodeURIComponent(presentationId)}/versions/${encodeURIComponent(preview.version.id)}`,
      {
        body: JSON.stringify({ action: "restore", expectedUpdatedAt: currentUpdatedAt }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    if (!response.ok) {
      setMessage("Restore failed because the presentation changed.");
      return;
    }
    setPreview(null);
    setMessage("Version restored as a new current version.");
    await loadVersions();
  }

  return (
    <section className={ui.card} aria-labelledby="presentation-history-title">
      <h2 id="presentation-history-title" className={ui.sectionTitle}>
        Version history
      </h2>
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
        <input
          aria-label="Version change summary"
          className={ui.input}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="What changed?"
          value={summary}
        />
        <Button onClick={() => void createRestorePoint()} variant="primary">
          Create restore point
        </Button>
      </div>
      {message ? <p className="mt-2 text-sm font-bold text-emerald-700">{message}</p> : null}
      <ol className="mt-4 grid list-none gap-2 p-0">
        {versions.length === 0 ? <li className={ui.muted}>No restore points yet.</li> : null}
        {versions.map((version) => (
          <li
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-canvas p-3"
            key={version.id}
          >
            <span className="text-sm font-bold text-ink">
              v{version.version} · {version.changeSummary ?? "Restore point"} · {version.source}
            </span>
            <Button onClick={() => void previewVersion(version)}>Preview</Button>
          </li>
        ))}
      </ol>
      {preview ? (
        <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm font-extrabold text-ink">
            Preview version {preview.version.version}
          </p>
          <p className="mt-1 text-sm text-muted">
            Snapshot contains {preview.changedSlides} slides. Restoring creates a new version and
            preserves history.
          </p>
          <Button className="mt-3" onClick={() => void restoreVersion()} variant="primary">
            Restore this version
          </Button>
        </div>
      ) : null}
    </section>
  );
}
