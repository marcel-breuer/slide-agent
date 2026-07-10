"use client";

/* global HTMLFormElement, URLSearchParams */

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from "react";
import { Archive, FileJson, Loader2, Palette, Plus, RotateCcw, Search } from "lucide-react";

import { Button, ButtonLink, PageHeader, ui } from "./ui";

type ProfileDefinition = {
  colors: Array<{ hex: string; name: string; role: string }>;
  fonts: Array<{ family: string; role: string; weight?: string }>;
  layoutRules: string[];
  logos: Array<{ altText: string; placement: string; storageKey?: string }>;
  previewCards: Array<{ description: string; title: string }>;
  sourceEvidence: string[];
};

export type DesignProfileSummary = {
  id: string;
  name: string;
  description: string | null;
  sourceType: string;
  archivedAt: string | null;
  updatedAt: string;
  usageCount: number;
  activeVersion: {
    profile: ProfileDefinition;
    version: number;
  } | null;
};

type ProfilesApiResponse =
  | { ok: true; data: DesignProfileSummary[] }
  | { ok: false; error: { code: string; message: string } };

type ProfileApiResponse =
  | { ok: true; data: DesignProfileSummary }
  | { ok: false; error: { code: string; message: string } };

const emptyDefinition: ProfileDefinition = {
  colors: [],
  fonts: [],
  layoutRules: [],
  logos: [],
  previewCards: [],
  sourceEvidence: [],
};

export function DesignProfileWorkspace(): ReactElement {
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importJson, setImportJson] = useState("");
  const [includeArchived, setIncludeArchived] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [name, setName] = useState("");
  const [profiles, setProfiles] = useState<DesignProfileSummary[]>([]);
  const [query, setQuery] = useState("");

  async function loadProfiles(): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ includeArchived: String(includeArchived) });
      if (query.trim()) params.set("query", query.trim());
      const response = await fetch(`/api/design-profiles?${params.toString()}`);
      const payload = (await response.json()) as ProfilesApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Design profiles could not be loaded." : payload.error.message);
        return;
      }
      setProfiles(payload.data);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Design profiles could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadProfiles();
  }, [includeArchived]);

  async function createProfile(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!name.trim()) return;

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/design-profiles", {
        body: JSON.stringify({
          description: description.trim() || null,
          name,
          profile: {
            ...emptyDefinition,
            colors: [{ hex: "#0F766E", name: "Primary teal", role: "Primary accent" }],
            fonts: [{ family: "Inter", role: "Body" }],
            layoutRules: ["Use strong hierarchy and generous spacing."],
            previewCards: [{ title: "Title slide", description: "High contrast headline layout." }],
          },
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as ProfileApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Design profile could not be created." : payload.error.message);
        return;
      }

      setProfiles((current) => [payload.data, ...current]);
      setDescription("");
      setName("");
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Design profile could not be created.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function importProfile(): Promise<void> {
    setIsImporting(true);
    setError(null);

    try {
      const parsed = JSON.parse(importJson) as unknown;
      const response = await fetch("/api/design-profiles/imports", {
        body: JSON.stringify(parsed),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as ProfileApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Design profile could not be imported." : payload.error.message);
        return;
      }

      setProfiles((current) => [payload.data, ...current]);
      setImportJson("");
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Design profile import must be valid JSON.",
      );
    } finally {
      setIsImporting(false);
    }
  }

  async function setProfileArchived(profileId: string, archived: boolean): Promise<void> {
    setError(null);

    try {
      const response = await fetch(`/api/design-profiles/${encodeURIComponent(profileId)}`, {
        body: JSON.stringify({ archived }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as ProfileApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Design profile could not be updated." : payload.error.message);
        return;
      }
      setProfiles((current) =>
        current.map((profile) => (profile.id === profileId ? payload.data : profile)),
      );
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : "Design profile could not be updated.",
      );
    }
  }

  const activeProfiles = useMemo(
    () => profiles.filter((profile) => !profile.archivedAt),
    [profiles],
  );
  const archivedProfiles = useMemo(
    () => profiles.filter((profile) => profile.archivedAt),
    [profiles],
  );

  return (
    <section className={ui.pageShell}>
      <PageHeader eyebrow="Design profiles" title="Profile management">
        Create reusable design systems from brand evidence, imported references, or manual rules.
      </PageHeader>

      {error ? <div className={ui.alert}>{error}</div> : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <form className={ui.card} onSubmit={(event) => void createProfile(event)}>
          <h2 className={ui.sectionTitle}>Create profile</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className={ui.field}>
              <span>Name</span>
              <input
                className={ui.input}
                value={name}
                maxLength={160}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>
            <label className={ui.field}>
              <span>Description</span>
              <input
                className={ui.input}
                value={description}
                maxLength={1000}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </div>
          <Button className="mt-4" type="submit" variant="primary" disabled={isCreating}>
            {isCreating ? (
              <Loader2 size={17} className="animate-spin" aria-hidden="true" />
            ) : (
              <Plus size={17} aria-hidden="true" />
            )}
            Create profile
          </Button>
        </form>

        <section className={ui.card}>
          <div className={ui.cardHeader}>
            <div>
              <h2 className={ui.sectionTitle}>Import JSON</h2>
              <p className={ui.muted}>Paste a validated profile payload with name and profile.</p>
            </div>
            <FileJson size={22} className="text-primary" aria-hidden="true" />
          </div>
          <textarea
            className="min-h-[116px] w-full resize-y rounded-lg border border-line bg-white p-3 font-mono text-xs text-ink"
            value={importJson}
            onChange={(event) => setImportJson(event.target.value)}
            placeholder='{"name":"Brand kit","profile":{"colors":[],"fonts":[],"logos":[],"layoutRules":[],"previewCards":[]}}'
          />
          <Button
            className="mt-3"
            type="button"
            onClick={() => void importProfile()}
            disabled={isImporting || !importJson.trim()}
          >
            {isImporting ? (
              <Loader2 size={17} className="animate-spin" aria-hidden="true" />
            ) : (
              <FileJson size={17} aria-hidden="true" />
            )}
            Import profile
          </Button>
        </section>
      </div>

      <section className={ui.card}>
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_auto_auto]">
          <label className={ui.field}>
            <span>Search</span>
            <input
              className={ui.input}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name or description"
            />
          </label>
          <label className="flex items-end gap-2 text-sm font-bold text-ink">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
            />
            Include archived
          </label>
          <div className="flex items-end">
            <Button type="button" onClick={() => void loadProfiles()}>
              <Search size={17} aria-hidden="true" />
              Search
            </Button>
          </div>
        </div>
      </section>

      <ProfileList
        emptyLabel={isLoading ? "Loading design profiles..." : "No active design profiles yet."}
        onArchiveChange={setProfileArchived}
        profiles={activeProfiles}
        title="Active profiles"
      />
      <ProfileList
        emptyLabel="No archived design profiles."
        onArchiveChange={setProfileArchived}
        profiles={archivedProfiles}
        title="Archived profiles"
      />
    </section>
  );
}

function ProfileList({
  emptyLabel,
  onArchiveChange,
  profiles,
  title,
}: {
  emptyLabel: string;
  onArchiveChange(profileId: string, archived: boolean): Promise<void>;
  profiles: DesignProfileSummary[];
  title: string;
}): ReactElement {
  return (
    <section className={ui.section}>
      <h2 className={ui.sectionTitle}>{title}</h2>
      {profiles.length === 0 ? (
        <p className={ui.empty}>{emptyLabel}</p>
      ) : (
        <ul className={ui.list}>
          {profiles.map((profile) => {
            const archived = Boolean(profile.archivedAt);
            const colors = profile.activeVersion?.profile.colors ?? [];

            return (
              <li className={ui.item} key={profile.id}>
                <div className={ui.itemMain}>
                  <div className={ui.itemTitle}>
                    <Palette size={18} aria-hidden="true" />
                    <Link
                      className={ui.itemTitleLink}
                      href={`/app/design-profiles/${encodeURIComponent(profile.id)}`}
                    >
                      {profile.name}
                    </Link>
                  </div>
                  {profile.description ? <p className={ui.muted}>{profile.description}</p> : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={ui.badge}>{profile.sourceType}</span>
                    <span className={ui.badge}>{profile.usageCount} uses</span>
                    <span className={ui.badge}>v{profile.activeVersion?.version ?? 0}</span>
                    {colors.map((color) => (
                      <span
                        key={`${profile.id}-${color.hex}-${color.role}`}
                        className="h-6 w-6 rounded-full border border-line"
                        style={{ backgroundColor: color.hex }}
                        title={`${color.name} ${color.hex}`}
                      />
                    ))}
                  </div>
                </div>
                <div className={ui.actionRow}>
                  <ButtonLink href={`/app/design-profiles/${encodeURIComponent(profile.id)}`}>
                    Open
                  </ButtonLink>
                  <button
                    type="button"
                    className={ui.iconButton}
                    title={archived ? "Restore profile" : "Archive profile"}
                    onClick={() => void onArchiveChange(profile.id, !archived)}
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
