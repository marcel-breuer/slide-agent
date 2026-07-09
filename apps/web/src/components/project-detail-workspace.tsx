"use client";

/* global FormData, HTMLFormElement */

import Link from "next/link";
import type { Route } from "next";
import { Archive, Copy, ExternalLink, Loader2, Pencil, Plus, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from "react";

import { PresentationImportPanel } from "./presentation-import-panel";

type PresentationSummary = {
  id: string;
  title: string;
  status: string;
  requestedSlideCount: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  editorUrl: string;
};

type ProjectDetail = {
  id: string;
  name: string;
  description: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  presentations: PresentationSummary[];
};

type ProjectApiResponse =
  { ok: true; data: ProjectDetail } | { ok: false; error: { code: string; message: string } };

type PresentationApiResponse =
  { ok: true; data: PresentationSummary } | { ok: false; error: { code: string; message: string } };

export function ProjectDetailWorkspace({ projectId }: { projectId: string }): ReactElement {
  const [createTitle, setCreateTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [name, setName] = useState("");
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [requestedSlideCount, setRequestedSlideCount] = useState(10);

  async function loadProject(): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`);
      const payload = (await response.json()) as ProjectApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Project could not be loaded." : payload.error.message);
        return;
      }

      setProject(payload.data);
      setName(payload.data.name);
      setDescription(payload.data.description ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Project could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadProject();
  }, [projectId]);

  async function updateProject(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!project || !name.trim()) return;

    setError(null);
    const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
      body: JSON.stringify({
        description: description.trim() || null,
        name,
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    const payload = (await response.json()) as ProjectApiResponse;
    if (!response.ok || !payload.ok) {
      setError(payload.ok ? "Project could not be updated." : payload.error.message);
      return;
    }

    setProject((current) => (current ? { ...current, ...payload.data } : current));
  }

  async function setProjectArchived(archived: boolean): Promise<void> {
    if (!project) return;

    setError(null);
    const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
      body: JSON.stringify({ archived }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    const payload = (await response.json()) as ProjectApiResponse;
    if (!response.ok || !payload.ok) {
      setError(payload.ok ? "Project could not be updated." : payload.error.message);
      return;
    }

    setProject((current) => (current ? { ...current, ...payload.data } : current));
  }

  async function createPresentation(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!project || !createTitle.trim()) return;

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/presentations", {
        body: JSON.stringify({
          projectId: project.id,
          requestedSlideCount,
          title: createTitle,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as PresentationApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Presentation could not be created." : payload.error.message);
        return;
      }

      globalThis.location.assign(payload.data.editorUrl);
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Presentation could not be created.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function updatePresentation(
    presentationId: string,
    body: { archived?: boolean; title?: string },
  ): Promise<void> {
    setError(null);
    const response = await fetch(`/api/presentations/${encodeURIComponent(presentationId)}`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    const payload = (await response.json()) as PresentationApiResponse;
    if (!response.ok || !payload.ok) {
      setError(payload.ok ? "Presentation could not be updated." : payload.error.message);
      return;
    }

    setProject((current) =>
      current
        ? {
            ...current,
            presentations: current.presentations.map((presentation) =>
              presentation.id === presentationId ? payload.data : presentation,
            ),
          }
        : current,
    );
  }

  async function duplicatePresentation(presentationId: string): Promise<void> {
    setError(null);
    const response = await fetch(
      `/api/presentations/${encodeURIComponent(presentationId)}/duplicate`,
      {
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    const payload = (await response.json()) as PresentationApiResponse;
    if (!response.ok || !payload.ok) {
      setError(payload.ok ? "Presentation could not be duplicated." : payload.error.message);
      return;
    }

    setProject((current) =>
      current ? { ...current, presentations: [payload.data, ...current.presentations] } : current,
    );
  }

  const activePresentations = useMemo(
    () => project?.presentations.filter((presentation) => !presentation.archivedAt) ?? [],
    [project],
  );
  const archivedPresentations = useMemo(
    () => project?.presentations.filter((presentation) => presentation.archivedAt) ?? [],
    [project],
  );

  if (isLoading) {
    return (
      <section className="workspace-shell">
        <p className="workspace-empty">Loading project...</p>
      </section>
    );
  }

  if (!project) {
    return (
      <section className="workspace-shell">
        {error ? <div className="workspace-alert">{error}</div> : null}
        <Link className="workspace-button" href="/app/projects">
          Back to projects
        </Link>
      </section>
    );
  }

  const projectArchived = Boolean(project.archivedAt);

  return (
    <section className="workspace-shell">
      <div className="workspace-header">
        <div>
          <p className="workspace-kicker">Project</p>
          <h1>{project.name}</h1>
          {project.description ? <p>{project.description}</p> : null}
        </div>
        <div className="workspace-actions">
          <Link className="workspace-button" href="/app/projects">
            Back
          </Link>
          <button
            type="button"
            className="workspace-button"
            onClick={() => void setProjectArchived(!projectArchived)}
          >
            {projectArchived ? (
              <RotateCcw size={17} aria-hidden="true" />
            ) : (
              <Archive size={17} aria-hidden="true" />
            )}
            {projectArchived ? "Restore" : "Archive"}
          </button>
        </div>
      </div>

      {error ? <div className="workspace-alert">{error}</div> : null}

      <form className="workspace-form" onSubmit={(event) => void updateProject(event)}>
        <div className="workspace-field">
          <label htmlFor="project-detail-name">Project name</label>
          <input
            id="project-detail-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={160}
            required
          />
        </div>
        <div className="workspace-field">
          <label htmlFor="project-detail-description">Description</label>
          <input
            id="project-detail-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={1000}
          />
        </div>
        <button type="submit" className="workspace-button">
          <Pencil size={17} aria-hidden="true" />
          Save
        </button>
      </form>

      {!projectArchived ? (
        <>
          <form className="workspace-form" onSubmit={(event) => void createPresentation(event)}>
            <div className="workspace-field">
              <label htmlFor="presentation-title">Presentation title</label>
              <input
                id="presentation-title"
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
                maxLength={180}
                required
              />
            </div>
            <div className="workspace-field compact">
              <label htmlFor="slide-count">Slides</label>
              <input
                id="slide-count"
                type="number"
                min={1}
                max={50}
                value={requestedSlideCount}
                onChange={(event) => setRequestedSlideCount(Number(event.target.value))}
              />
            </div>
            <button type="submit" className="workspace-button primary" disabled={isCreating}>
              {isCreating ? (
                <Loader2 size={17} className="import-spin" aria-hidden="true" />
              ) : (
                <Plus size={17} aria-hidden="true" />
              )}
              Create presentation
            </button>
          </form>

          <PresentationImportPanel projectId={project.id} />
        </>
      ) : null}

      <PresentationList
        emptyLabel="No active presentations yet."
        onArchiveChange={(presentationId, archived) =>
          updatePresentation(presentationId, { archived })
        }
        onDuplicate={duplicatePresentation}
        onRename={(presentationId, title) => updatePresentation(presentationId, { title })}
        presentations={activePresentations}
        title="Active presentations"
      />

      <PresentationList
        emptyLabel="No archived presentations."
        onArchiveChange={(presentationId, archived) =>
          updatePresentation(presentationId, { archived })
        }
        onDuplicate={duplicatePresentation}
        onRename={(presentationId, title) => updatePresentation(presentationId, { title })}
        presentations={archivedPresentations}
        title="Archived presentations"
      />
    </section>
  );
}

function PresentationList({
  emptyLabel,
  onArchiveChange,
  onDuplicate,
  onRename,
  presentations,
  title,
}: {
  emptyLabel: string;
  onArchiveChange(presentationId: string, archived: boolean): Promise<void>;
  onDuplicate(presentationId: string): Promise<void>;
  onRename(presentationId: string, title: string): Promise<void>;
  presentations: PresentationSummary[];
  title: string;
}): ReactElement {
  return (
    <section className="workspace-section">
      <h2>{title}</h2>
      {presentations.length === 0 ? (
        <p className="workspace-empty">{emptyLabel}</p>
      ) : (
        <ul className="workspace-list">
          {presentations.map((presentation) => {
            const archived = Boolean(presentation.archivedAt);
            const overviewUrl = `/app/presentations/${encodeURIComponent(presentation.id)}`;

            return (
              <li className="workspace-item" key={presentation.id}>
                <div className="workspace-item-main">
                  <div className="workspace-item-title">
                    <Link href={overviewUrl as Route}>{presentation.title}</Link>
                  </div>
                  <p className="workspace-meta">
                    {presentation.status} · {presentation.requestedSlideCount} slides
                  </p>
                  <form
                    className="workspace-inline-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const formData = new FormData(event.currentTarget);
                      const titleValue = String(formData.get("title") ?? "").trim();
                      if (titleValue) void onRename(presentation.id, titleValue);
                    }}
                  >
                    <input name="title" defaultValue={presentation.title} maxLength={180} />
                    <button type="submit" className="workspace-icon-button" title="Rename">
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                  </form>
                </div>
                <div className="workspace-actions">
                  {!archived ? (
                    <Link className="workspace-button" href={overviewUrl as Route}>
                      Workflow
                    </Link>
                  ) : null}
                  {!archived ? (
                    <Link className="workspace-button" href={presentation.editorUrl as Route}>
                      Editor
                      <ExternalLink size={16} aria-hidden="true" />
                    </Link>
                  ) : null}
                  {!archived ? (
                    <button
                      type="button"
                      className="workspace-icon-button"
                      title="Duplicate presentation"
                      onClick={() => void onDuplicate(presentation.id)}
                    >
                      <Copy size={17} aria-hidden="true" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="workspace-icon-button"
                    title={archived ? "Restore presentation" : "Archive presentation"}
                    onClick={() => void onArchiveChange(presentation.id, !archived)}
                  >
                    {archived ? (
                      <RotateCcw size={17} aria-hidden="true" />
                    ) : (
                      <Archive size={17} aria-hidden="true" />
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
