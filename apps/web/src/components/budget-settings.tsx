"use client";

/* global HTMLFormElement */

import { AlertTriangle, CheckCircle2, Loader2, Save } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactElement } from "react";

import { useUiLocale } from "@/lib/ui-locale";

type BudgetSnapshot = {
  settings: {
    hardStopEnabled: boolean;
    monthlyMoneyBudget: number | null;
    monthlyTokenBudget: number | null;
    preferredCurrency: string;
    warningThresholdPercentage: number;
  };
  usage: {
    estimatedCost: number;
    hardStopReached: boolean;
    inputTokens: number;
    moneyUsagePercentage: number | null;
    monthEnd: string;
    monthStart: string;
    operations: number;
    outputTokens: number;
    remainingMoneyBudget: number | null;
    remainingTokenBudget: number | null;
    tokenUsagePercentage: number | null;
    tokens: number;
    warningReached: boolean;
  };
};

type BudgetFormState = {
  hardStopEnabled: boolean;
  monthlyMoneyBudget: string;
  monthlyTokenBudget: string;
  warningThresholdPercentage: number;
};

type BudgetApiResponse =
  { ok: true; data: BudgetSnapshot } | { ok: false; error: { code: string; message: string } };

export function BudgetSettings(): ReactElement {
  const { msg } = useUiLocale();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<BudgetFormState>({
    hardStopEnabled: true,
    monthlyMoneyBudget: "",
    monthlyTokenBudget: "",
    warningThresholdPercentage: 80,
  });
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [snapshot, setSnapshot] = useState<BudgetSnapshot | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void loadBudgetSettings();
  }, []);

  async function loadBudgetSettings(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/settings/budget");
      const payload = (await response.json()) as BudgetApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Budget settings could not be loaded." : payload.error.message);
        return;
      }
      applySnapshot(payload.data);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Budget settings could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function saveBudgetSettings(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setSaved(false);
    setError(null);

    try {
      const response = await fetch("/api/settings/budget", {
        body: JSON.stringify({
          hardStopEnabled: form.hardStopEnabled,
          monthlyMoneyBudget: parseOptionalNumber(form.monthlyMoneyBudget),
          monthlyTokenBudget: parseOptionalNumber(form.monthlyTokenBudget),
          warningThresholdPercentage: form.warningThresholdPercentage,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as BudgetApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Budget settings could not be saved." : payload.error.message);
        return;
      }
      applySnapshot(payload.data);
      setSaved(true);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Budget settings could not be saved.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function applySnapshot(nextSnapshot: BudgetSnapshot): void {
    setSnapshot(nextSnapshot);
    setForm({
      hardStopEnabled: nextSnapshot.settings.hardStopEnabled,
      monthlyMoneyBudget:
        nextSnapshot.settings.monthlyMoneyBudget === null
          ? ""
          : String(nextSnapshot.settings.monthlyMoneyBudget),
      monthlyTokenBudget:
        nextSnapshot.settings.monthlyTokenBudget === null
          ? ""
          : String(nextSnapshot.settings.monthlyTokenBudget),
      warningThresholdPercentage: nextSnapshot.settings.warningThresholdPercentage,
    });
  }

  return (
    <section className="mx-auto w-full max-w-[1180px] px-6 py-8">
      <div className="mb-5 flex items-start justify-between gap-5">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-muted">
            {msg("navSettings")}
          </p>
          <h1 className="mt-1 text-[28px] font-extrabold leading-tight text-ink">
            {msg("budgetControls")}
          </h1>
          <p className="mt-2 text-sm font-bold text-muted">{msg("budgetControlsDescription")}</p>
        </div>
      </div>

      {loading ? (
        <p className="rounded-app border border-dashed border-line bg-white p-4 text-sm text-muted">
          {msg("loadingBudgetSettings")}
        </p>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-app border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">
          {error}
        </div>
      ) : null}
      {saved ? (
        <p className="mb-4 inline-flex items-center gap-2 rounded-app border border-green-200 bg-green-50 px-3 py-2.5 text-sm font-extrabold text-green-800">
          <CheckCircle2 size={16} aria-hidden="true" />
          {msg("saved")}
        </p>
      ) : null}

      {snapshot ? (
        <div className="grid gap-4">
          <section className="rounded-app border border-line bg-white p-[18px]">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="mb-3 text-[17px] font-extrabold leading-snug text-ink">
                  Current month
                </h2>
                <p className="text-[13px] font-bold text-muted">
                  {formatDate(snapshot.usage.monthStart)} to {formatDate(snapshot.usage.monthEnd)}
                </p>
              </div>
              <BudgetStatus snapshot={snapshot} />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <BudgetMeter
                label="Spend"
                value={formatCurrency(
                  snapshot.usage.estimatedCost,
                  snapshot.settings.preferredCurrency,
                )}
                detail={formatBudgetDetail(
                  snapshot.usage.remainingMoneyBudget,
                  snapshot.settings.monthlyMoneyBudget,
                  snapshot.settings.preferredCurrency,
                )}
                percentage={snapshot.usage.moneyUsagePercentage}
              />
              <BudgetMeter
                label="Tokens"
                value={formatInteger(snapshot.usage.tokens)}
                detail={formatTokenDetail(
                  snapshot.usage.remainingTokenBudget,
                  snapshot.settings.monthlyTokenBudget,
                )}
                percentage={snapshot.usage.tokenUsagePercentage}
              />
              <div className="rounded-app border border-line bg-canvas p-3.5">
                <span className="text-xs font-extrabold uppercase tracking-wide text-muted">
                  Operations
                </span>
                <strong className="mt-1.5 block text-xl font-extrabold leading-tight text-ink">
                  {formatInteger(snapshot.usage.operations)}
                </strong>
              </div>
              <div className="rounded-app border border-line bg-canvas p-3.5">
                <span className="text-xs font-extrabold uppercase tracking-wide text-muted">
                  Input / output
                </span>
                <strong className="mt-1.5 block text-xl font-extrabold leading-tight text-ink">
                  {formatInteger(snapshot.usage.inputTokens)} /{" "}
                  {formatInteger(snapshot.usage.outputTokens)}
                </strong>
              </div>
            </div>
          </section>

          <section className="rounded-app border border-line bg-white p-[18px]">
            <h2 className="mb-3.5 text-[17px] font-extrabold leading-snug text-ink">Limits</h2>
            <form
              className="grid gap-3.5 md:grid-cols-2"
              onSubmit={(event) => void saveBudgetSettings(event)}
            >
              <label className="grid gap-1.5 text-xs font-extrabold uppercase tracking-wide text-muted">
                <span>Monthly spend budget</span>
                <input
                  className="h-[42px] min-w-0 rounded-app border border-line bg-white px-3 text-sm font-medium normal-case text-ink"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="No spend limit"
                  value={form.monthlyMoneyBudget}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      monthlyMoneyBudget: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="grid gap-1.5 text-xs font-extrabold uppercase tracking-wide text-muted">
                <span>Monthly token budget</span>
                <input
                  className="h-[42px] min-w-0 rounded-app border border-line bg-white px-3 text-sm font-medium normal-case text-ink"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="No token limit"
                  value={form.monthlyTokenBudget}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      monthlyTokenBudget: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="grid gap-1.5 text-xs font-extrabold uppercase tracking-wide text-muted">
                <span>Warning threshold</span>
                <input
                  className="h-[42px] min-w-0 rounded-app border border-line bg-white px-3 text-sm font-medium normal-case text-ink"
                  type="number"
                  min={1}
                  max={100}
                  value={form.warningThresholdPercentage}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      warningThresholdPercentage: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="grid gap-1.5 text-xs font-extrabold uppercase tracking-wide text-muted">
                <span>Hard stop</span>
                <select
                  className="h-[42px] min-w-0 rounded-app border border-line bg-white px-3 text-sm font-medium normal-case text-ink"
                  value={form.hardStopEnabled ? "true" : "false"}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      hardStopEnabled: event.target.value === "true",
                    }))
                  }
                >
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </label>

              <button
                type="submit"
                className="inline-flex min-h-10 w-fit items-center justify-center gap-2 rounded-app border border-primary bg-primary px-3.5 text-sm font-extrabold text-white hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-70"
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Save size={17} aria-hidden="true" />
                )}
                Save budget
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function BudgetMeter(props: {
  detail: string;
  label: string;
  percentage: number | null;
  value: string;
}): ReactElement {
  const percentage = props.percentage ?? 0;

  return (
    <div className="rounded-app border border-line bg-canvas p-3.5">
      <div>
        <span className="text-xs font-extrabold uppercase tracking-wide text-muted">
          {props.label}
        </span>
        <strong className="mt-1.5 block text-xl font-extrabold leading-tight text-ink">
          {props.value}
        </strong>
        <p className="mt-1 text-[13px] font-bold text-muted">{props.detail}</p>
      </div>
      <div className="mt-3.5 h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${Math.min(100, percentage)}%` }}
        />
      </div>
    </div>
  );
}

function BudgetStatus(props: { snapshot: BudgetSnapshot }): ReactElement {
  if (props.snapshot.usage.hardStopReached) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-extrabold text-red-800">
        <AlertTriangle size={15} aria-hidden="true" />
        Hard stop
      </span>
    );
  }

  if (props.snapshot.usage.warningReached) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-extrabold text-amber-800">
        <AlertTriangle size={15} aria-hidden="true" />
        Warning
      </span>
    );
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1.5 text-xs font-extrabold text-green-800">
      <CheckCircle2 size={15} aria-hidden="true" />
      In range
    </span>
  );
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return Number(trimmed);
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("en", {
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatBudgetDetail(
  remaining: number | null,
  budget: number | null,
  currency: string,
): string {
  if (budget === null || remaining === null) return "No spend limit configured";
  return `${formatCurrency(Math.max(0, remaining), currency)} remaining of ${formatCurrency(
    budget,
    currency,
  )}`;
}

function formatTokenDetail(remaining: number | null, budget: number | null): string {
  if (budget === null || remaining === null) return "No token limit configured";
  return `${formatInteger(Math.max(0, remaining))} remaining of ${formatInteger(budget)}`;
}
