"use client";

import { AlertTriangle, CheckCircle2, CreditCard, Loader2 } from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";

import { useUiLocale } from "@/lib/ui-locale";

type BillingMetric = "presentations" | "storageBytes" | "exports" | "generations" | "members";
type BillingSnapshot = {
  access: "active" | "grace" | "limited";
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string;
  currentPeriodStart: string;
  graceUntil: string | null;
  limits: Record<BillingMetric, number>;
  plan: string;
  planLabel: string;
  remaining: Record<BillingMetric, number>;
  status: string;
  usage: Record<BillingMetric, number>;
};
type BillingResponse =
  | { ok: true; data: BillingSnapshot }
  | { ok: false; error: { message: string } };

export function BillingSettings(): ReactElement {
  const { msg } = useUiLocale();
  const [snapshot, setSnapshot] = useState<BillingSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadBilling();
  }, []);

  async function loadBilling(): Promise<void> {
    setError(null);
    try {
      const response = await fetch("/api/billing");
      const payload = (await response.json()) as BillingResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Billing could not be loaded." : payload.error.message);
        return;
      }
      setSnapshot(payload.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Billing could not be loaded.");
    }
  }

  async function updateCancellation(): Promise<void> {
    if (!snapshot) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/billing", {
        body: JSON.stringify({ action: snapshot.cancelAtPeriodEnd ? "reactivate" : "cancel" }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as BillingResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Billing action failed." : payload.error.message);
        return;
      }
      setSnapshot(payload.data);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Billing action failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-[1180px] px-6 py-8">
      <div className="mb-5 flex items-start justify-between gap-5">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-muted">{msg("navSettings")}</p>
          <h1 className="mt-1 text-[28px] font-extrabold leading-tight text-ink">{msg("billing")}</h1>
          <p className="mt-2 text-sm font-bold text-muted">{msg("billingDescription")}</p>
        </div>
        <CreditCard className="text-primary" size={28} aria-hidden="true" />
      </div>

      {error ? <p className="mb-4 rounded-app border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}
      {!snapshot ? (
        <div className="flex items-center gap-2 rounded-app border border-dashed border-line bg-white p-4 text-sm font-bold text-muted">
          <Loader2 className="animate-spin" size={16} aria-hidden="true" />
          {msg("loadingBilling")}
        </div>
      ) : (
        <div className="grid gap-4">
          <section className="rounded-app border border-line bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wide text-muted">Current plan</p>
                <h2 className="mt-1 text-2xl font-extrabold text-ink">{snapshot.planLabel}</h2>
                <p className="mt-1 text-sm font-bold text-muted">
                  {snapshot.status.replace("_", " ")} · {formatDate(snapshot.currentPeriodStart)} – {formatDate(snapshot.currentPeriodEnd)}
                </p>
              </div>
              <div className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${snapshot.access === "limited" ? "bg-red-100 text-red-800" : snapshot.access === "grace" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>
                {snapshot.access === "limited" ? <AlertTriangle className="mr-1 inline" size={14} /> : <CheckCircle2 className="mr-1 inline" size={14} />}
                {snapshot.access}
              </div>
            </div>
            {snapshot.access !== "active" ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-900">Payment or subscription action is required before limited features can be used.</p> : null}
            <button type="button" onClick={() => void updateCancellation()} disabled={saving} className="mt-4 rounded-lg border border-line px-3 py-2 text-sm font-extrabold text-ink hover:border-primary hover:text-primary disabled:opacity-50">
              {saving ? "Saving…" : snapshot.cancelAtPeriodEnd ? "Reactivate subscription" : "Cancel at period end"}
            </button>
          </section>

          <section className="grid gap-3 md:grid-cols-2">
            {(Object.keys(snapshot.usage) as BillingMetric[]).map((metric) => (
              <div key={metric} className="rounded-app border border-line bg-white p-4">
                <div className="flex items-center justify-between gap-3 text-sm font-extrabold text-ink">
                  <span>{metricLabel(metric)}</span><span>{formatMetric(metric, snapshot.usage[metric])} / {formatMetric(metric, snapshot.limits[metric])}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-canvas"><div className={`h-full rounded-full ${snapshot.remaining[metric] === 0 ? "bg-red-500" : "bg-primary"}`} style={{ width: `${Math.min(100, (snapshot.usage[metric] / Math.max(1, snapshot.limits[metric])) * 100)}%` }} /></div>
                <p className="mt-2 text-xs font-bold text-muted">{formatMetric(metric, snapshot.remaining[metric])} remaining</p>
              </div>
            ))}
          </section>
        </div>
      )}
    </section>
  );
}

function formatDate(value: string): string { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)); }
function formatMetric(metric: BillingMetric, value: number): string { return metric === "storageBytes" ? `${Math.round(value / 1024 / 1024)} MB` : value.toLocaleString(); }
function metricLabel(metric: BillingMetric): string { return metric === "storageBytes" ? "Storage" : metric.charAt(0).toUpperCase() + metric.slice(1); }
