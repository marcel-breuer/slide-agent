"use client";

/* global HTMLFormElement */

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from "react";
import { Archive, FolderOpen, Loader2, Plus, RotateCcw } from "lucide-react";

import { Button, ButtonLink, PageHeader, ui } from "./ui";

type ProjectSummary = {
  id: string;
  teamId: string | null;
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

type TeamSummary = { id: string; name: string; role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER" };

export function ProjectWorkspace(): ReactElement {
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [name, setName] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [teamId, setTeamId] = useState("");
  const [teams, setTeams] = useState<TeamSummary[]>([]);

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
      const teamsResponse = await fetch("/api/teams");
      const teamsPayload = (await teamsResponse.json()) as
        | { ok: true; data: TeamSummary[] }
        | { ok: false; error: { message: string } };
      if (teamsResponse.ok && teamsPayload.ok) setTeams(teamsPayload.data);
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
          teamId: teamId || undefined,
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
      setTeamId("");
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
    <section className={ui.pageShell}>
      <PageHeader eyebrow="Projects" title="Workspace" />

      {error ? <div className={ui.alert}>{error}</div> : null}

      <form className={ui.form} onSubmit={(event) => void createProject(event)}>
        <div className={ui.field}>
          <label htmlFor="project-name">Project name</label>
          <input
            className={ui.input}
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={160}
            required
          />
        </div>
        <div className={ui.field}>
          <label htmlFor="project-team">Workspace</label>
          <select className={ui.input} id="project-team" value={teamId} onChange={(event) => setTeamId(event.target.value)}>
            <option value="">Personal workspace</option>
            {teams.filter((team) => team.role !== "VIEWER").map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </div>
        <div className={ui.field}>
          <label htmlFor="project-description">Description</label>
          <input
            className={ui.input}
            id="project-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={1000}
          />
        </div>
        <Button type="submit" variant="primary" disabled={isCreating}>
          {isCreating ? (
            <Loader2 size={17} className="animate-spin" aria-hidden="true" />
          ) : (
            <Plus size={17} aria-hidden="true" />
          )}
          Create project
        </Button>
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
    <section className={ui.section}>
      <h2 className={ui.sectionTitle}>{title}</h2>
      {projects.length === 0 ? (
        <p className={ui.empty}>{emptyLabel}</p>
      ) : (
        <ul className={ui.list}>
          {projects.map((project) => {
            const archived = Boolean(project.archivedAt);

            return (
              <li className={ui.item} key={project.id}>
                <div className={ui.itemMain}>
                  <div className={ui.itemTitle}>
                    <FolderOpen size={18} aria-hidden="true" />
                    <Link
                      className={ui.itemTitleLink}
                      href={`/app/projects/${encodeURIComponent(project.id)}`}
                    >
                      {project.name}
                    </Link>
                  </div>
                  {project.description ? <p className={ui.muted}>{project.description}</p> : null}
                  <p className={ui.itemMeta}>
                    {project.activePresentationCount} active presentations,{" "}
                    {project.presentationCount} total
                  </p>
                </div>
                <div className={ui.actionRow}>
                  <ButtonLink href={`/app/projects/${encodeURIComponent(project.id)}`}>
                    Open
                  </ButtonLink>
                  <button
                    type="button"
                    className={ui.iconButton}
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
