"use client";

import { Archive, Layers, Loader2, RotateCcw, Save } from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";

import { Button, ButtonLink, PageHeader, ui } from "./ui";
import type {
  ReusableAssetDefinition,
  ReusableAssetKind,
  ReusableAssetSummary,
} from "./reusable-asset-workspace";

type AssetApiResponse =
  | { ok: true; data: ReusableAssetSummary }
  | { ok: false; error: { code: string; message: string } };

export function ReusableAssetDetail({ assetId }: { assetId: string }): ReactElement {
  const [asset, setAsset] = useState<ReusableAssetSummary | null>(null);
  const [definitionJson, setDefinitionJson] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [kind, setKind] = useState<ReusableAssetKind>("TEMPLATE");
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");

  async function loadAsset(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/templates/${encodeURIComponent(assetId)}`);
      const payload = (await response.json()) as AssetApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Template could not be loaded." : payload.error.message);
        return;
      }
      setAsset(payload.data);
      setName(payload.data.name);
      setDescription(payload.data.description ?? "");
      setKind(payload.data.kind);
      setDefinitionJson(JSON.stringify(payload.data.activeVersion?.definition ?? {}, null, 2));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Template could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAsset();
  }, [assetId]);

  async function saveAsset(): Promise<void> {
    setIsSaving(true);
    setError(null);
    try {
      const definition = JSON.parse(definitionJson) as ReusableAssetDefinition;
      const response = await fetch(`/api/templates/${encodeURIComponent(assetId)}`, {
        body: JSON.stringify({ description: description.trim() || null, definition, kind, name }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as AssetApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Template could not be saved." : payload.error.message);
        return;
      }
      setAsset(payload.data);
      setDefinitionJson(JSON.stringify(payload.data.activeVersion?.definition ?? {}, null, 2));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Template JSON is invalid.");
    } finally {
      setIsSaving(false);
    }
  }

  async function setArchived(archived: boolean): Promise<void> {
    setIsSaving(true);
    setError(null);
    try {
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
      setAsset(payload.data);
    } finally {
      setIsSaving(false);
    }
  }

  const archived = Boolean(asset?.archivedAt);

  return (
    <section className={ui.pageShell}>
      <PageHeader
        eyebrow="Templates & kits"
        title={asset?.name ?? "Reusable asset"}
        actions={<ButtonLink href="/app/templates">Back</ButtonLink>}
      >
        Edit versioned template or brand-kit data and review where it is used.
      </PageHeader>
      {loading ? <p className={ui.empty}>Loading reusable asset...</p> : null}
      {error ? <div className={ui.alert}>{error}</div> : null}
      {asset ? (
        <div className="grid gap-4">
          <section className={ui.card}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={ui.badge}>
                <Layers size={14} className="mr-1" />
                {asset.kind === "BRAND_KIT" ? "Brand kit" : "Template"}
              </span>
              <span className={ui.badge}>v{asset.activeVersion?.version ?? 0}</span>
              <span className={ui.badge}>{asset.usageCount} uses</span>
              {archived ? <span className={ui.badge}>archived</span> : null}
            </div>
          </section>
          <section className={ui.card}>
            <div className="grid gap-3 md:grid-cols-2">
              <label className={ui.field}>
                <span>Name</span>
                <input
                  className={ui.input}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
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
              />
            </label>
            <label className={`${ui.field} mt-3`}>
              <span>Definition JSON</span>
              <textarea
                className="min-h-[380px] w-full resize-y rounded-lg border border-line bg-white p-3 font-mono text-xs text-ink"
                value={definitionJson}
                onChange={(event) => setDefinitionJson(event.target.value)}
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="primary"
                type="button"
                disabled={isSaving}
                onClick={() => void saveAsset()}
              >
                {isSaving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}Save
                new version
              </Button>
              <Button type="button" disabled={isSaving} onClick={() => void setArchived(!archived)}>
                {archived ? <RotateCcw size={17} /> : <Archive size={17} />}
                {archived ? "Restore" : "Archive"}
              </Button>
            </div>
          </section>
          <section className={ui.card}>
            <h2 className={ui.sectionTitle}>Version history</h2>
            <ul className={ui.list}>
              {asset.activeVersion ? (
                <li className={ui.item}>
                  <span className={ui.itemTitle}>Version {asset.activeVersion.version}</span>
                  <span className={ui.itemMeta}>{asset.usageCount} presentation uses</span>
                </li>
              ) : null}
              {asset.activeVersion ? (
                asset.activeVersion.version > 1 ? (
                  <li className={ui.item}>
                    <span className={ui.itemTitle}>Previous versions</span>
                    <span className={ui.itemMeta}>Available in the resource history</span>
                  </li>
                ) : null
              ) : null}
            </ul>
          </section>
        </div>
      ) : null}
    </section>
  );
}
