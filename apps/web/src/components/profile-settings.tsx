"use client";

/* global HTMLFormElement, document, window */

import { CheckCircle2, Download, Loader2, Save, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactElement } from "react";

import { Button, PageHeader, ui } from "./ui";

type Profile = {
  createdAt: string;
  displayName: string | null;
  email: string;
  id: string;
  preferredCurrency: string;
  timeZone: string;
  updatedAt: string;
};

type ProfileApiResponse =
  { ok: true; data: Profile } | { ok: false; error: { code: string; message: string } };

type DeleteApiResponse =
  | { ok: true; data: { deleted: boolean } }
  | { ok: false; error: { code: string; message: string } };

export function ProfileSettings(): ReactElement {
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [preferredCurrency, setPreferredCurrency] = useState("EUR");
  const [saved, setSaved] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [timeZone, setTimeZone] = useState("Europe/Berlin");

  useEffect(() => {
    void loadProfile();
  }, []);

  async function loadProfile(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/settings/profile");
      const payload = (await response.json()) as ProfileApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Profile could not be loaded." : payload.error.message);
        return;
      }
      applyProfile(payload.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Profile could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setSaved(null);
    setError(null);

    try {
      const response = await fetch("/api/settings/profile", {
        body: JSON.stringify({
          displayName: displayName.trim() || null,
          preferredCurrency,
          timeZone,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as ProfileApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Profile could not be saved." : payload.error.message);
        return;
      }
      applyProfile(payload.data);
      setSaved("Profile saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Profile could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  async function exportAccountData(): Promise<void> {
    setExporting(true);
    setSaved(null);
    setError(null);

    try {
      const response = await fetch("/api/settings/profile/export");
      if (!response.ok) {
        setError("Account export could not be created.");
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "slide-agent-account-export.json";
      link.click();
      window.URL.revokeObjectURL(url);
      setSaved("Account export is ready.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Account export failed.");
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount(): Promise<void> {
    setSubmitting(true);
    setSaved(null);
    setError(null);

    try {
      const response = await fetch("/api/settings/profile", {
        body: JSON.stringify({
          confirmation: "DELETE_ACCOUNT",
          email: deleteConfirmation,
        }),
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      });
      const payload = (await response.json()) as DeleteApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Account could not be deleted." : payload.error.message);
        return;
      }
      setSaved("Account deleted.");
      window.location.assign("/login");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Account could not be deleted.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function applyProfile(profile: Profile): void {
    setDisplayName(profile.displayName ?? "");
    setEmail(profile.email);
    setPreferredCurrency(profile.preferredCurrency);
    setTimeZone(profile.timeZone);
  }

  const canDelete = email.length > 0 && deleteConfirmation.toLowerCase() === email.toLowerCase();

  return (
    <section className={ui.workflowShell}>
      <PageHeader eyebrow="Settings" title="Profile settings">
        Account identity, regional preferences, data export, and account lifecycle controls.
      </PageHeader>

      {loading ? <p className={ui.empty}>Loading profile...</p> : null}
      {error ? <div className={ui.alert}>{error}</div> : null}
      {saved ? (
        <p className={ui.success}>
          <CheckCircle2 size={16} aria-hidden="true" />
          {saved}
        </p>
      ) : null}

      <div className="grid gap-4">
        <section className={ui.card}>
          <h2 className={ui.sectionTitle}>Account profile</h2>
          <form className={ui.settingsForm} onSubmit={(event) => void saveProfile(event)}>
            <label className={ui.field}>
              <span>Email</span>
              <input className={ui.input} value={email} disabled readOnly />
            </label>
            <label className={ui.field}>
              <span>Display name</span>
              <input
                className={ui.input}
                value={displayName}
                maxLength={120}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            <label className={ui.field}>
              <span>Preferred currency</span>
              <select
                className={ui.input}
                value={preferredCurrency}
                onChange={(event) => setPreferredCurrency(event.target.value)}
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <label className={ui.field}>
              <span>Time zone</span>
              <input
                className={ui.input}
                value={timeZone}
                maxLength={80}
                onChange={(event) => setTimeZone(event.target.value)}
              />
            </label>
            <div className="flex items-end">
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? (
                  <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Save size={17} aria-hidden="true" />
                )}
                Save profile
              </Button>
            </div>
          </form>
        </section>

        <section className={ui.card}>
          <div className={ui.cardHeader}>
            <div>
              <h2 className={ui.sectionTitle}>Account data export</h2>
              <p className={ui.muted}>
                Download account-scoped profile, settings, usage, and presentation metadata.
              </p>
            </div>
            <Button type="button" onClick={() => void exportAccountData()} disabled={exporting}>
              {exporting ? (
                <Loader2 size={17} className="animate-spin" aria-hidden="true" />
              ) : (
                <Download size={17} aria-hidden="true" />
              )}
              Export data
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-red-200 bg-white p-[18px] shadow-sm">
          <h2 className="mb-3 text-base font-extrabold leading-snug text-red-900">
            Delete account
          </h2>
          <p className="mb-4 text-sm leading-6 text-red-800">
            Type your account email to confirm deletion. This revokes sessions and removes stored
            provider credentials.
          </p>
          <div className="grid gap-3.5 md:grid-cols-[minmax(240px,1fr)_auto]">
            <label className={ui.field}>
              <span>Confirm email</span>
              <input
                className={ui.input}
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
              />
            </label>
            <div className="flex items-end">
              <Button
                variant="danger"
                type="button"
                disabled={!canDelete || submitting}
                onClick={() => void deleteAccount()}
              >
                {submitting ? (
                  <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 size={17} aria-hidden="true" />
                )}
                Delete account
              </Button>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
