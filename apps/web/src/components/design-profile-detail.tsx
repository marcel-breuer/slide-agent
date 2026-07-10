"use client";

import { useEffect, useState, type ReactElement } from "react";
import { Archive, Loader2, Palette, RotateCcw } from "lucide-react";

import { Button, PageHeader, ui } from "./ui";

type ProfileDefinition = {
  colors?: Array<{ hex: string; name: string; role: string }>;
  fonts?: Array<{ family: string; role: string; weight?: string }>;
  layoutRules?: string[];
  logos?: Array<{ altText: string; placement: string; storageKey?: string }>;
  previewCards?: Array<{ description: string; title: string }>;
  sourceEvidence?: string[];
};

type DesignProfileDetailData = {
  id: string;
  name: string;
  description: string | null;
  sourceType: string;
  sourceEvidence: unknown;
  archivedAt: string | null;
  usageCount: number;
  activeVersion: {
    profile: ProfileDefinition;
    version: number;
    createdAt: string;
  } | null;
  versions: Array<{
    version: number;
    createdAt: string;
  }>;
};

type ProfileApiResponse =
  | { ok: true; data: DesignProfileDetailData }
  | { ok: false; error: { code: string; message: string } };

export function DesignProfileDetail({ profileId }: { profileId: string }): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<DesignProfileDetailData | null>(null);

  async function loadProfile(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/design-profiles/${encodeURIComponent(profileId)}`);
      const payload = (await response.json()) as ProfileApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Design profile could not be loaded." : payload.error.message);
        return;
      }
      setProfile(payload.data);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Design profile could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfile();
  }, [profileId]);

  async function setArchived(archived: boolean): Promise<void> {
    setIsUpdating(true);
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
      setProfile(payload.data);
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : "Design profile could not be updated.",
      );
    } finally {
      setIsUpdating(false);
    }
  }

  const definition = profile?.activeVersion?.profile ?? {};
  const archived = Boolean(profile?.archivedAt);

  return (
    <section className={ui.pageShell}>
      <PageHeader
        eyebrow="Design profiles"
        title={profile?.name ?? "Design profile"}
        actions={
          profile ? (
            <Button type="button" disabled={isUpdating} onClick={() => void setArchived(!archived)}>
              {isUpdating ? (
                <Loader2 size={17} className="animate-spin" aria-hidden="true" />
              ) : archived ? (
                <RotateCcw size={17} aria-hidden="true" />
              ) : (
                <Archive size={17} aria-hidden="true" />
              )}
              {archived ? "Restore profile" : "Archive profile"}
            </Button>
          ) : null
        }
      >
        {profile?.description ?? "Review colors, fonts, logos, rules, evidence, and versions."}
      </PageHeader>

      {loading ? <p className={ui.empty}>Loading design profile...</p> : null}
      {error ? <div className={ui.alert}>{error}</div> : null}

      {profile ? (
        <div className="grid gap-4">
          <section className={ui.card}>
            <div className="flex flex-wrap gap-2">
              <span className={ui.badge}>{profile.sourceType}</span>
              <span className={ui.badge}>{profile.usageCount} uses</span>
              <span className={ui.badge}>v{profile.activeVersion?.version ?? 0}</span>
              {archived ? <span className={ui.badge}>archived</span> : null}
            </div>
          </section>

          <section className={ui.card}>
            <h2 className={ui.sectionTitle}>Colors</h2>
            <div className="grid gap-3 md:grid-cols-3">
              {(definition.colors ?? []).map((color) => (
                <div
                  className="flex items-center gap-3 rounded-lg border border-line p-3"
                  key={`${color.hex}-${color.role}`}
                >
                  <span
                    className="h-10 w-10 rounded-lg border border-line"
                    style={{ backgroundColor: color.hex }}
                  />
                  <span>
                    <span className="block text-sm font-extrabold text-ink">{color.name}</span>
                    <span className="block text-xs font-bold text-muted">
                      {color.role} · {color.hex}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <ProfilePanel title="Fonts" items={(definition.fonts ?? []).map(formatFont)} />
            <ProfilePanel title="Logos" items={(definition.logos ?? []).map(formatLogo)} />
            <ProfilePanel title="Layout rules" items={definition.layoutRules ?? []} />
            <ProfilePanel title="Source evidence" items={readEvidence(profile.sourceEvidence)} />
          </section>

          <section className={ui.card}>
            <h2 className={ui.sectionTitle}>Preview cards</h2>
            <div className="grid gap-3 md:grid-cols-3">
              {(definition.previewCards ?? []).map((card) => (
                <article className="rounded-lg border border-line bg-canvas p-4" key={card.title}>
                  <Palette size={18} className="mb-3 text-primary" aria-hidden="true" />
                  <h3 className="text-sm font-extrabold text-ink">{card.title}</h3>
                  <p className={ui.muted}>{card.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section className={ui.card}>
            <h2 className={ui.sectionTitle}>Version history</h2>
            <ul className={ui.list}>
              {profile.versions.map((version) => (
                <li
                  className="flex justify-between rounded-lg border border-line p-3"
                  key={version.version}
                >
                  <span className="text-sm font-extrabold text-ink">Version {version.version}</span>
                  <span className="text-sm font-bold text-muted">
                    {new Date(version.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function ProfilePanel({ items, title }: { items: string[]; title: string }): ReactElement {
  return (
    <section className={ui.card}>
      <h2 className={ui.sectionTitle}>{title}</h2>
      {items.length === 0 ? (
        <p className={ui.empty}>No entries yet.</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((item) => (
            <li
              className="rounded-lg border border-line bg-white p-3 text-sm font-bold text-ink"
              key={item}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatFont(font: { family: string; role: string; weight?: string }): string {
  return [font.role, font.family, font.weight].filter(Boolean).join(" · ");
}

function formatLogo(logo: { altText: string; placement: string; storageKey?: string }): string {
  return [logo.altText, logo.placement, logo.storageKey].filter(Boolean).join(" · ");
}

function readEvidence(sourceEvidence: unknown): string[] {
  if (
    sourceEvidence &&
    typeof sourceEvidence === "object" &&
    "items" in sourceEvidence &&
    Array.isArray(sourceEvidence.items)
  ) {
    return sourceEvidence.items.filter((item): item is string => typeof item === "string");
  }

  return [];
}
