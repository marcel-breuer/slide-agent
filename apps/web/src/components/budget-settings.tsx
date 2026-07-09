"use client";

/* global HTMLFormElement */

import { AlertTriangle, CheckCircle2, Loader2, Save } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactElement } from "react";

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
    <section className="workflow-shell">
      <div className="workflow-header">
        <div>
          <p className="workspace-kicker">Settings</p>
          <h1>Budget controls</h1>
          <p>Monthly spend and token controls for protected generation workflows.</p>
        </div>
      </div>

      {loading ? <p className="workspace-empty">Loading budget settings...</p> : null}
      {error ? <div className="workspace-alert">{error}</div> : null}
      {saved ? (
        <p className="settings-success">
          <CheckCircle2 size={16} aria-hidden="true" />
          Saved
        </p>
      ) : null}

      {snapshot ? (
        <div className="budget-settings-layout">
          <section className="workflow-card">
            <div className="budget-summary-header">
              <div>
                <h2>Current month</h2>
                <p>
                  {formatDate(snapshot.usage.monthStart)} to {formatDate(snapshot.usage.monthEnd)}
                </p>
              </div>
              <BudgetStatus snapshot={snapshot} />
            </div>

            <div className="budget-summary-grid">
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
              <div className="budget-stat">
                <span>Operations</span>
                <strong>{formatInteger(snapshot.usage.operations)}</strong>
              </div>
              <div className="budget-stat">
                <span>Input / output</span>
                <strong>
                  {formatInteger(snapshot.usage.inputTokens)} /{" "}
                  {formatInteger(snapshot.usage.outputTokens)}
                </strong>
              </div>
            </div>
          </section>

          <section className="workflow-card">
            <h2>Limits</h2>
            <form
              className="workflow-form settings-form"
              onSubmit={(event) => void saveBudgetSettings(event)}
            >
              <label>
                Monthly spend budget
                <input
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
              <label>
                Monthly token budget
                <input
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
              <label>
                Warning threshold
                <input
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
              <label>
                Hard stop
                <select
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

              <button type="submit" className="workspace-button primary" disabled={submitting}>
                {submitting ? (
                  <Loader2 size={17} className="import-spin" aria-hidden="true" />
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
    <div className="budget-meter">
      <div>
        <span>{props.label}</span>
        <strong>{props.value}</strong>
        <p>{props.detail}</p>
      </div>
      <div className="budget-meter-track" aria-hidden="true">
        <span style={{ width: `${Math.min(100, percentage)}%` }} />
      </div>
    </div>
  );
}

function BudgetStatus(props: { snapshot: BudgetSnapshot }): ReactElement {
  if (props.snapshot.usage.hardStopReached) {
    return (
      <span className="budget-status blocked">
        <AlertTriangle size={15} aria-hidden="true" />
        Hard stop
      </span>
    );
  }

  if (props.snapshot.usage.warningReached) {
    return (
      <span className="budget-status warning">
        <AlertTriangle size={15} aria-hidden="true" />
        Warning
      </span>
    );
  }

  return (
    <span className="budget-status ready">
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
