"use client";

/* global HTMLFormElement URLSearchParams */

import Link from "next/link";
import type { Route } from "next";
import { Archive, FileJson, Layers, Loader2, Plus, RotateCcw, Search } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from "react";

import { Button, ButtonLink, PageHeader, ui } from "./ui";

export type ReusableAssetKind = "TEMPLATE" | "BRAND_KIT";

export type ReusableAssetSummary = {
  id: string;
  name: string;
  description: string | null;
  kind: ReusableAssetKind;
  archivedAt: string | null;
  updatedAt: string;
  usageCount: number;
  activeVersion: {
    definition: ReusableAssetDefinition;
    version: number;
    compatibilityWarnings: string[];
  } | null;
};

export type ReusableAssetDefinition = {
  profile: {
    colors: Array<{ hex: string; name: string; role: string }>;
    fonts: Array<{ family: string; role: string; weight?: string }>;
    layoutRules: string[];
    logos: Array<{ altText: string; placement: string; storageKey?: string }>;
    previewCards: Array<{ description: string; title: string }>;
    sourceEvidence: string[];
  };
  slides: unknown[];
};

type AssetsApiResponse =
  | { ok: true; data: ReusableAssetSummary[] }
  | { ok: false; error: { code: string; message: string } };
type AssetApiResponse =
  | { ok: true; data: ReusableAssetSummary }
  | { ok: false; error: { code: string; message: string } };

const emptyDefinition: ReusableAssetDefinition = {
  profile: {
    colors: [],
    fonts: [],
    layoutRules: [],
    logos: [],
    previewCards: [],
    sourceEvidence: [],
  },
  slides: [],
};

export function ReusableAssetWorkspace(): ReactElement {
  const [description, setDescription] = useState("");
  const [definitionJson, setDefinitionJson] = useState(() =>
    JSON.stringify(emptyDefinition, null, 2),
  );
  const [error, setError] = useState<string | null>(null);
  const [importJson, setImportJson] = useState("");
  const [includeArchived, setIncludeArchived] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [kind, setKind] = useState<ReusableAssetKind>("TEMPLATE");
  const [name, setName] = useState("");
  const [assets, setAssets] = useState<ReusableAssetSummary[]>([]);
  const [query, setQuery] = useState("");

  async function loadAssets(): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ includeArchived: String(includeArchived) });
      if (query.trim()) params.set("query", query.trim());
      const response = await fetch(`/api/templates?${params.toString()}`);
      const payload = (await response.json()) as AssetsApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Templates could not be loaded." : payload.error.message);
        return;
      }
      setAssets(payload.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Templates could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadAssets();
  }, [includeArchived]);

  async function createAsset(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!name.trim()) return;

    setIsCreating(true);
    setError(null);
    try {
      const definition = JSON.parse(definitionJson) as unknown;
      const response = await fetch("/api/templates", {
        body: JSON.stringify({ description: description.trim() || null, definition, kind, name }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as AssetApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Template could not be created." : payload.error.message);
        return;
      }
      setAssets((current) => [payload.data, ...current]);
      setName("");
      setDescription("");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Template JSON is invalid.");
    } finally {
      setIsCreating(false);
    }
  }

  async function importAsset(): Promise<void> {
    setIsImporting(true);
    setError(null);
    try {
      const response = await fetch("/api/templates/imports", {
        body: importJson,
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as AssetApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Template could not be imported." : payload.error.message);
        return;
      }
      setAssets((current) => [payload.data, ...current]);
      setImportJson("");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Template JSON is invalid.");
    } finally {
      setIsImporting(false);
    }
  }

  async function setArchived(assetId: string, archived: boolean): Promise<void> {
    setError(null);
    const response = await fetch(`/api/templates/${encodeURIComponent(assetId)}`, {
      body: JSON.stringify({ archived }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    const payload = (await response.json()) as AssetApiResponse;
    if (!response.ok || !payload.ok) {
      setError(payload.ok ? "Template could not be updated." : payload.error.message);
      return;
    }
    setAssets((current) => current.map((asset) => (asset.id === assetId ? payload.data : asset)));
  }

  const activeAssets = useMemo(() => assets.filter((asset) => !asset.archivedAt), [assets]);
  const archivedAssets = useMemo(() => assets.filter((asset) => asset.archivedAt), [assets]);

  return (
    <section className={ui.pageShell}>
      <PageHeader eyebrow="Templates & kits" title="Reusable assets">
        Manage reusable slide structures, brand colors, fonts, logos, and layout rules.
      </PageHeader>

      {error ? <div className={ui.alert}>{error}</div> : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <form className={ui.card} onSubmit={(event) => void createAsset(event)}>
          <h2 className={ui.sectionTitle}>Create reusable asset</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className={ui.field}>
              <span>Name</span>
              <input
                className={ui.input}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>
            <label className={ui.field}>
              <span>Type</span>
              <select
                className={ui.input}
                value={kind}
                onChange={(event) => setKind(event.target.value as ReusableAssetKind)}
              >
                <option value="TEMPLATE">Template</option>
                <option value="BRAND_KIT">Brand kit</option>
              </select>
            </label>
          </div>
          <label className={`${ui.field} mt-3`}>
            <span>Description</span>
            <input
              className={ui.input}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={1000}
            />
          </label>
          <label className={`${ui.field} mt-3`}>
            <span>Definition JSON</span>
            <textarea
              className="min-h-[180px] w-full resize-y rounded-lg border border-line bg-white p-3 font-mono text-xs text-ink"
              value={definitionJson}
              onChange={(event) => setDefinitionJson(event.target.value)}
            />
          </label>
          <Button className="mt-4" type="submit" variant="primary" disabled={isCreating}>
            {isCreating ? (
              <Loader2 size={17} className="animate-spin" aria-hidden="true" />
            ) : (
              <Plus size={17} aria-hidden="true" />
            )}
            Create asset
          </Button>
        </form>

        <section className={ui.card}>
          <div className={ui.cardHeader}>
            <div>
              <h2 className={ui.sectionTitle}>Import JSON</h2>
              <p className={ui.muted}>Import a validated template or brand-kit definition.</p>
            </div>
            <FileJson size={22} className="text-primary" aria-hidden="true" />
          </div>
          <textarea
            className="min-h-[180px] w-full resize-y rounded-lg border border-line bg-white p-3 font-mono text-xs text-ink"
            value={importJson}
            onChange={(event) => setImportJson(event.target.value)}
            placeholder='{"name":"Board kit","kind":"BRAND_KIT","definition":{"profile":{"colors":[],"fonts":[],"logos":[],"layoutRules":[],"previewCards":[],"sourceEvidence":[]},"slides":[]}}'
          />
          <Button
            className="mt-3"
            type="button"
            onClick={() => void importAsset()}
            disabled={isImporting || !importJson.trim()}
          >
            {isImporting ? (
              <Loader2 size={17} className="animate-spin" aria-hidden="true" />
            ) : (
              <FileJson size={17} aria-hidden="true" />
            )}
            Import asset
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
            <Button type="button" onClick={() => void loadAssets()}>
              <Search size={17} aria-hidden="true" />
              Search
            </Button>
          </div>
        </div>
      </section>

      <AssetList
        assets={activeAssets}
        emptyLabel={isLoading ? "Loading reusable assets..." : "No active reusable assets yet."}
        onArchiveChange={setArchived}
        title="Active assets"
      />
      <AssetList
        assets={archivedAssets}
        emptyLabel="No archived reusable assets."
        onArchiveChange={setArchived}
        title="Archived assets"
      />
    </section>
  );
}

function AssetList({
  assets,
  emptyLabel,
  onArchiveChange,
  title,
}: {
  assets: ReusableAssetSummary[];
  emptyLabel: string;
  onArchiveChange(assetId: string, archived: boolean): Promise<void>;
  title: string;
}): ReactElement {
  return (
    <section className={ui.section}>
      <h2 className={ui.sectionTitle}>{title}</h2>
      {assets.length === 0 ? (
        <p className={ui.empty}>{emptyLabel}</p>
      ) : (
        <ul className={ui.list}>
          {assets.map((asset) => {
            const archived = Boolean(asset.archivedAt);
            const compatibilityWarnings = asset.activeVersion?.compatibilityWarnings ?? [];
            const detailUrl = `/app/templates/${encodeURIComponent(asset.id)}` as Route;
            return (
              <li className={ui.item} key={asset.id}>
                <div className={ui.itemMain}>
                  <div className={ui.itemTitle}>
                    <Layers size={17} className="text-primary" aria-hidden="true" />
                    <Link className={ui.itemTitleLink} href={detailUrl}>
                      {asset.name}
                    </Link>
                  </div>
                  <p className={ui.itemMeta}>
                    {asset.kind === "BRAND_KIT" ? "Brand kit" : "Template"} · v
                    {asset.activeVersion?.version ?? 0} · {asset.usageCount} uses
                  </p>
                  {asset.description ? <p className={ui.muted}>{asset.description}</p> : null}
                  {compatibilityWarnings.length ? (
                    <p className={ui.itemMeta}>
                      {compatibilityWarnings.length} compatibility warning(s)
                    </p>
                  ) : null}
                </div>
                <div className={ui.actionRow}>
                  <ButtonLink href={detailUrl}>Edit</ButtonLink>
                  <Button type="button" onClick={() => void onArchiveChange(asset.id, !archived)}>
                    {archived ? (
                      <RotateCcw size={16} aria-hidden="true" />
                    ) : (
                      <Archive size={16} aria-hidden="true" />
                    )}
                    {archived ? "Restore" : "Archive"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
