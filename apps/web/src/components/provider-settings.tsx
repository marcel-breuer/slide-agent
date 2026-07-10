"use client";

/* global HTMLFormElement */

import { CheckCircle2, Loader2, Save, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactElement } from "react";

import { useUiLocale } from "@/lib/ui-locale";

import { Button, PageHeader, cn, ui } from "./ui";

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
  const { msg } = useUiLocale();
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
    <section className={ui.workflowShell}>
      <PageHeader eyebrow={msg("navSettings")} title={msg("providers")} />

      {loading ? <p className={ui.empty}>{msg("loadingProviders")}</p> : null}
      {error ? <div className={ui.alert}>{error}</div> : null}

      <div className="grid gap-4">
        {providers.map((provider) => {
          const form = forms[provider.provider] ?? toForm(provider);
          const busy = submitting[provider.provider] ?? false;
          return (
            <section
              className="grid gap-[18px] rounded-lg border border-line bg-white p-[18px] shadow-sm"
              key={provider.provider}
            >
              <div className="flex items-start justify-between gap-4 max-[960px]:flex-col">
                <div>
                  <h2 className="text-lg font-extrabold leading-snug text-ink">
                    {provider.displayName}
                  </h2>
                  <p className="mt-1 text-[13px] font-bold text-muted">
                    {provider.maskedValue ?? "No credential stored"}
                  </p>
                </div>
                <span
                  className={cn(ui.badge, provider.configured && provider.enabled && ui.badgeReady)}
                >
                  {provider.configured && provider.enabled ? "Ready" : "Not configured"}
                </span>
              </div>

              <form
                className="grid gap-3.5 md:grid-cols-2"
                onSubmit={(event) => void saveProvider(provider, event)}
              >
                <label className={ui.field}>
                  <span>Enabled</span>
                  <select
                    className={ui.input}
                    value={form.enabled ? "true" : "false"}
                    onChange={(event) =>
                      updateForm(provider.provider, { enabled: event.target.value === "true" })
                    }
                  >
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </select>
                </label>
                <label className={ui.field}>
                  <span>Default model</span>
                  <select
                    className={ui.input}
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
                <label className={ui.field}>
                  <span>API key</span>
                  <input
                    className={ui.input}
                    type="password"
                    value={form.apiKey}
                    placeholder={provider.configured ? "Keep existing key" : "Enter API key"}
                    onChange={(event) =>
                      updateForm(provider.provider, { apiKey: event.target.value })
                    }
                  />
                </label>
                <label className={ui.field}>
                  <span>Base URL</span>
                  <input
                    className={ui.input}
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
                  <p className={cn(ui.success, "md:col-span-2")}>
                    <CheckCircle2 size={16} aria-hidden="true" />
                    {status[provider.provider]}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2.5 md:col-span-2">
                  <Button variant="primary" type="submit" disabled={busy}>
                    {busy ? (
                      <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Save size={17} aria-hidden="true" />
                    )}
                    Save
                  </Button>
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void verifyProvider(provider)}
                  >
                    <ShieldCheck size={17} aria-hidden="true" />
                    Verify
                  </Button>
                  <Button
                    variant="danger"
                    type="button"
                    disabled={busy || !provider.configured}
                    onClick={() => void removeProvider(provider)}
                  >
                    <Trash2 size={17} aria-hidden="true" />
                    Remove
                  </Button>
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
