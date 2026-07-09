"use client";

/* global HTMLFormElement */

import { CheckCircle2, Loader2, Save, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactElement } from "react";

type ProviderModel = {
  model: string;
  displayLabel: string;
};

type ProviderSummary = {
  provider: string;
  displayName: string;
  enabled: boolean;
  configured: boolean;
  maskedValue: string | null;
  baseUrl: string | null;
  defaultModel: string | null;
  models: ProviderModel[];
  updatedAt: string | null;
};

type ProviderFormState = {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  enabled: boolean;
};

type ProvidersApiResponse =
  | { ok: true; data: { providers: ProviderSummary[] } }
  | { ok: false; error: { code: string; message: string } };

type ProviderSaveResponse =
  | {
      ok: true;
      data: {
        defaultModel: string;
        enabled: boolean;
        maskedValue: string | null;
        provider: string;
        valid: boolean;
      };
    }
  | { ok: false; error: { code: string; message: string } };

type ProviderVerifyResponse =
  | {
      ok: true;
      data: {
        errorCategory: string | null;
        maskedIdentifier: string | null;
        provider: string;
        valid: boolean;
      };
    }
  | { ok: false; error: { code: string; message: string } };

export function ProviderSettings(): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, ProviderFormState>>({});
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [status, setStatus] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void loadProviders();
  }, []);

  async function loadProviders(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/settings/providers");
      const payload = (await response.json()) as ProvidersApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Providers could not be loaded." : payload.error.message);
        return;
      }
      setProviders(payload.data.providers);
      setForms(
        Object.fromEntries(
          payload.data.providers.map((provider) => [provider.provider, toForm(provider)]),
        ),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Providers could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  async function saveProvider(
    provider: ProviderSummary,
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const form = forms[provider.provider] ?? toForm(provider);
    setSubmitting((current) => ({ ...current, [provider.provider]: true }));
    setStatus((current) => ({ ...current, [provider.provider]: "" }));
    setError(null);

    try {
      const response = await fetch(
        `/api/settings/providers/${encodeURIComponent(provider.provider)}`,
        {
          body: JSON.stringify({
            ...(form.apiKey ? { apiKey: form.apiKey } : {}),
            ...(form.baseUrl ? { baseUrl: form.baseUrl } : {}),
            defaultModel: form.defaultModel,
            enabled: form.enabled,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const payload = (await response.json()) as ProviderSaveResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Provider could not be saved." : payload.error.message);
        return;
      }
      setStatus((current) => ({ ...current, [provider.provider]: "Saved and verified." }));
      await loadProviders();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Provider could not be saved.");
    } finally {
      setSubmitting((current) => ({ ...current, [provider.provider]: false }));
    }
  }

  async function verifyProvider(provider: ProviderSummary): Promise<void> {
    const form = forms[provider.provider] ?? toForm(provider);
    setSubmitting((current) => ({ ...current, [provider.provider]: true }));
    setStatus((current) => ({ ...current, [provider.provider]: "" }));
    setError(null);

    try {
      const response = await fetch(
        `/api/settings/providers/${encodeURIComponent(provider.provider)}/verify`,
        {
          body: JSON.stringify({
            ...(form.apiKey ? { apiKey: form.apiKey } : {}),
            ...(form.baseUrl ? { baseUrl: form.baseUrl } : {}),
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const payload = (await response.json()) as ProviderVerifyResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Provider could not be verified." : payload.error.message);
        return;
      }
      setStatus((current) => ({
        ...current,
        [provider.provider]: payload.data.valid ? "Credential verified." : "Credential is invalid.",
      }));
    } catch (verifyError) {
      setError(
        verifyError instanceof Error ? verifyError.message : "Provider could not be verified.",
      );
    } finally {
      setSubmitting((current) => ({ ...current, [provider.provider]: false }));
    }
  }

  async function removeProvider(provider: ProviderSummary): Promise<void> {
    setSubmitting((current) => ({ ...current, [provider.provider]: true }));
    setStatus((current) => ({ ...current, [provider.provider]: "" }));
    setError(null);

    try {
      const response = await fetch(
        `/api/settings/providers/${encodeURIComponent(provider.provider)}`,
        {
          method: "DELETE",
        },
      );
      const payload = (await response.json()) as
        { ok: true; data: { deleted: boolean } } | { ok: false; error: { message: string } };
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Provider could not be removed." : payload.error.message);
        return;
      }
      setStatus((current) => ({ ...current, [provider.provider]: "Credential removed." }));
      await loadProviders();
    } catch (removeError) {
      setError(
        removeError instanceof Error ? removeError.message : "Provider could not be removed.",
      );
    } finally {
      setSubmitting((current) => ({ ...current, [provider.provider]: false }));
    }
  }

  function updateForm(provider: string, patch: Partial<ProviderFormState>): void {
    setForms((current) => ({
      ...current,
      [provider]: {
        ...(current[provider] ?? {
          apiKey: "",
          baseUrl: "",
          defaultModel: "",
          enabled: false,
        }),
        ...patch,
      },
    }));
  }

  return (
    <section className="workflow-shell">
      <div className="workflow-header">
        <div>
          <p className="workspace-kicker">Settings</p>
          <h1>AI providers</h1>
        </div>
      </div>

      {loading ? <p className="workspace-empty">Loading providers...</p> : null}
      {error ? <div className="workspace-alert">{error}</div> : null}

      <div className="provider-settings-grid">
        {providers.map((provider) => {
          const form = forms[provider.provider] ?? toForm(provider);
          const busy = submitting[provider.provider] ?? false;
          return (
            <section className="workflow-card provider-settings-card" key={provider.provider}>
              <div className="provider-settings-card-header">
                <div>
                  <h2>{provider.displayName}</h2>
                  <p>{provider.maskedValue ?? "No credential stored"}</p>
                </div>
                <span
                  className={
                    provider.configured && provider.enabled
                      ? "provider-status ready"
                      : "provider-status"
                  }
                >
                  {provider.configured && provider.enabled ? "Ready" : "Not configured"}
                </span>
              </div>

              <form
                className="workflow-form provider-settings-form"
                onSubmit={(event) => void saveProvider(provider, event)}
              >
                <label>
                  Enabled
                  <select
                    value={form.enabled ? "true" : "false"}
                    onChange={(event) =>
                      updateForm(provider.provider, { enabled: event.target.value === "true" })
                    }
                  >
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </select>
                </label>
                <label>
                  Default model
                  <select
                    value={form.defaultModel}
                    onChange={(event) =>
                      updateForm(provider.provider, { defaultModel: event.target.value })
                    }
                  >
                    {provider.models.map((model) => (
                      <option key={model.model} value={model.model}>
                        {model.displayLabel}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  API key
                  <input
                    type="password"
                    value={form.apiKey}
                    placeholder={provider.configured ? "Keep existing key" : "Enter API key"}
                    onChange={(event) =>
                      updateForm(provider.provider, { apiKey: event.target.value })
                    }
                  />
                </label>
                <label>
                  Base URL
                  <input
                    value={form.baseUrl}
                    placeholder={
                      provider.provider === "local-openai-compatible"
                        ? "http://localhost:11434/v1"
                        : "Optional"
                    }
                    onChange={(event) =>
                      updateForm(provider.provider, { baseUrl: event.target.value })
                    }
                  />
                </label>

                {status[provider.provider] ? (
                  <p className="settings-success">
                    <CheckCircle2 size={16} aria-hidden="true" />
                    {status[provider.provider]}
                  </p>
                ) : null}

                <div className="provider-settings-actions">
                  <button className="workspace-button primary" type="submit" disabled={busy}>
                    {busy ? (
                      <Loader2 size={17} className="import-spin" aria-hidden="true" />
                    ) : (
                      <Save size={17} aria-hidden="true" />
                    )}
                    Save
                  </button>
                  <button
                    className="workspace-button"
                    type="button"
                    disabled={busy}
                    onClick={() => void verifyProvider(provider)}
                  >
                    <ShieldCheck size={17} aria-hidden="true" />
                    Verify
                  </button>
                  <button
                    className="workspace-button danger"
                    type="button"
                    disabled={busy || !provider.configured}
                    onClick={() => void removeProvider(provider)}
                  >
                    <Trash2 size={17} aria-hidden="true" />
                    Remove
                  </button>
                </div>
              </form>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function toForm(provider: ProviderSummary): ProviderFormState {
  return {
    apiKey: "",
    baseUrl: provider.baseUrl ?? "",
    defaultModel: provider.defaultModel ?? provider.models[0]?.model ?? "",
    enabled: provider.enabled,
  };
}
