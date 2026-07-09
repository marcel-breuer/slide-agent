"use client";

/* global HTMLFormElement */

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from "react";
import { Archive, FolderOpen, Loader2, Plus, RotateCcw } from "lucide-react";

type ProjectSummary = {
  id: string;
  name: string;
  description: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  presentationCount: number;
  activePresentationCount: number;
};

type ProjectsApiResponse =
  { ok: true; data: ProjectSummary[] } | { ok: false; error: { code: string; message: string } };

type ProjectApiResponse =
  { ok: true; data: ProjectSummary } | { ok: false; error: { code: string; message: string } };

export function ProjectWorkspace(): ReactElement {
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [name, setName] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);

  async function loadProjects(): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/projects?includeArchived=true");
      const payload = (await response.json()) as ProjectsApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Projects could not be loaded." : payload.error.message);
        return;
      }
      setProjects(payload.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Projects could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  async function createProject(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!name.trim()) return;

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/projects", {
        body: JSON.stringify({
          description: description.trim() || undefined,
          name,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as ProjectApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Project could not be created." : payload.error.message);
        return;
      }

      setProjects((current) => [payload.data, ...current]);
      setDescription("");
      setName("");
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Project could not be created.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function setProjectArchived(projectId: string, archived: boolean): Promise<void> {
    setError(null);

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
        body: JSON.stringify({ archived }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as ProjectApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Project could not be updated." : payload.error.message);
        return;
      }

      setProjects((current) =>
        current.map((project) =>
          project.id === projectId
            ? {
                ...project,
                archivedAt: payload.data.archivedAt,
                description: payload.data.description,
                name: payload.data.name,
                updatedAt: payload.data.updatedAt,
              }
            : project,
        ),
      );
    } catch (updateError) {
      setError(
        updateError instanceof Error ? updateError.message : "Project could not be updated.",
      );
    }
  }

  const activeProjects = useMemo(
    () => projects.filter((project) => !project.archivedAt),
    [projects],
  );
  const archivedProjects = useMemo(
    () => projects.filter((project) => project.archivedAt),
    [projects],
  );

  return (
    <section className="workspace-shell">
      <div className="workspace-header">
        <div>
          <p className="workspace-kicker">Projects</p>
          <h1>Workspace</h1>
        </div>
      </div>

      {error ? <div className="workspace-alert">{error}</div> : null}

      <form className="workspace-form" onSubmit={(event) => void createProject(event)}>
        <div className="workspace-field">
          <label htmlFor="project-name">Project name</label>
          <input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={160}
            required
          />
        </div>
        <div className="workspace-field">
          <label htmlFor="project-description">Description</label>
          <input
            id="project-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={1000}
          />
        </div>
        <button type="submit" className="workspace-button primary" disabled={isCreating}>
          {isCreating ? (
            <Loader2 size={17} className="import-spin" aria-hidden="true" />
          ) : (
            <Plus size={17} aria-hidden="true" />
          )}
          Create project
        </button>
      </form>

      <ProjectList
        emptyLabel={isLoading ? "Loading projects..." : "No active projects yet."}
        onArchiveChange={setProjectArchived}
        projects={activeProjects}
        title="Active projects"
      />

      <ProjectList
        emptyLabel="No archived projects."
        onArchiveChange={setProjectArchived}
        projects={archivedProjects}
        title="Archived projects"
      />
    </section>
  );
}

function ProjectList({
  emptyLabel,
  onArchiveChange,
  projects,
  title,
}: {
  emptyLabel: string;
  onArchiveChange(projectId: string, archived: boolean): Promise<void>;
  projects: ProjectSummary[];
  title: string;
}): ReactElement {
  return (
    <section className="workspace-section">
      <h2>{title}</h2>
      {projects.length === 0 ? (
        <p className="workspace-empty">{emptyLabel}</p>
      ) : (
        <ul className="workspace-list">
          {projects.map((project) => {
            const archived = Boolean(project.archivedAt);

            return (
              <li className="workspace-item" key={project.id}>
                <div className="workspace-item-main">
                  <div className="workspace-item-title">
                    <FolderOpen size={18} aria-hidden="true" />
                    <Link href={`/app/projects/${encodeURIComponent(project.id)}`}>
                      {project.name}
                    </Link>
                  </div>
                  {project.description ? <p>{project.description}</p> : null}
                  <p className="workspace-meta">
                    {project.activePresentationCount} active presentations,{" "}
                    {project.presentationCount} total
                  </p>
                </div>
                <div className="workspace-actions">
                  <Link
                    className="workspace-button"
                    href={`/app/projects/${encodeURIComponent(project.id)}`}
                  >
                    Open
                  </Link>
                  <button
                    type="button"
                    className="workspace-icon-button"
                    title={archived ? "Restore project" : "Archive project"}
                    onClick={() => void onArchiveChange(project.id, !archived)}
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
