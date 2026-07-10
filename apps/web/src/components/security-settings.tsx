"use client";

/* global HTMLFormElement */

import { CheckCircle2, KeyRound, Loader2, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactElement } from "react";

import { useUiLocale } from "@/lib/ui-locale";

import { Button, PageHeader, cn, ui } from "./ui";

type SecuritySession = {
  createdAt: string;
  current: boolean;
  expiresAt: string;
  id: string;
  rotatedAt: string | null;
};

type SecurityEvent = {
  action: string;
  createdAt: string;
  id: string;
  metadata: unknown;
};

type SecuritySnapshot = {
  auditEvents: SecurityEvent[];
  currentSessionId: string;
  sessions: SecuritySession[];
};

type SecurityApiResponse =
  { ok: true; data: SecuritySnapshot } | { ok: false; error: { code: string; message: string } };

type MutationResponse =
  | { ok: true; data: { revoked?: boolean; updated?: boolean } }
  | { ok: false; error: { code: string; message: string } };

export function SecuritySettings(): ReactElement {
  const { msg } = useUiLocale();
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SecuritySnapshot | null>(null);
  const [submittingPassword, setSubmittingPassword] = useState(false);

  useEffect(() => {
    void loadSecuritySettings();
  }, []);

  async function loadSecuritySettings(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/settings/security");
      const payload = (await response.json()) as SecurityApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Security settings could not be loaded." : payload.error.message);
        return;
      }
      setSnapshot(payload.data);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Security settings could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmittingPassword(true);
    setSaved(null);
    setError(null);

    try {
      const response = await fetch("/api/settings/security", {
        body: JSON.stringify({
          confirmation: "CHANGE_PASSWORD",
          currentPassword,
          newPassword,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as MutationResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Password could not be changed." : payload.error.message);
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setPasswordConfirmation("");
      setSaved(msg("passwordChanged"));
      await loadSecuritySettings();
    } catch (changeError) {
      setError(
        changeError instanceof Error ? changeError.message : "Password could not be changed.",
      );
    } finally {
      setSubmittingPassword(false);
    }
  }

  async function revokeSession(sessionId: string): Promise<void> {
    setRevokingSessionId(sessionId);
    setSaved(null);
    setError(null);

    try {
      const response = await fetch(
        `/api/settings/security/sessions/${encodeURIComponent(sessionId)}`,
        {
          body: JSON.stringify({ confirmation: "REVOKE_SESSION" }),
          headers: { "Content-Type": "application/json" },
          method: "DELETE",
        },
      );
      const payload = (await response.json()) as MutationResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Session could not be revoked." : payload.error.message);
        return;
      }
      setSaved(msg("sessionRevoked"));
      await loadSecuritySettings();
    } catch (revokeError) {
      setError(
        revokeError instanceof Error ? revokeError.message : "Session could not be revoked.",
      );
    } finally {
      setRevokingSessionId(null);
    }
  }

  const passwordsMatch = newPassword.length > 0 && newPassword === passwordConfirmation;
  const canChangePassword = currentPassword.length > 0 && passwordsMatch;

  return (
    <section className={ui.workflowShell}>
      <PageHeader eyebrow={msg("navSettings")} title={msg("securitySettings")}>
        {msg("securitySettingsDescription")}
      </PageHeader>

      {loading ? <p className={ui.empty}>{msg("loadingSecuritySettings")}</p> : null}
      {error ? <div className={ui.alert}>{error}</div> : null}
      {saved ? (
        <p className={ui.success}>
          <CheckCircle2 size={16} aria-hidden="true" />
          {saved}
        </p>
      ) : null}

      <div className="grid gap-4">
        <section className={ui.card}>
          <div className={ui.cardHeader}>
            <div>
              <h2 className={ui.sectionTitle}>{msg("password")}</h2>
              <p className={ui.muted}>{msg("passwordSettingsDescription")}</p>
            </div>
            <span className={cn(ui.badge, "border-emerald-200 bg-emerald-50 text-emerald-800")}>
              <ShieldCheck size={14} aria-hidden="true" />
              {msg("confirmationRequired")}
            </span>
          </div>
          <form className={ui.settingsForm} onSubmit={(event) => void changePassword(event)}>
            <label className={ui.field}>
              <span>{msg("currentPassword")}</span>
              <input
                className={ui.input}
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <label className={ui.field}>
              <span>{msg("newPassword")}</span>
              <input
                className={ui.input}
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <label className={ui.field}>
              <span>{msg("repeatNewPassword")}</span>
              <input
                className={ui.input}
                type="password"
                autoComplete="new-password"
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
              />
            </label>
            <div className="flex items-end">
              <Button
                variant="primary"
                type="submit"
                disabled={!canChangePassword || submittingPassword}
              >
                {submittingPassword ? (
                  <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                ) : (
                  <KeyRound size={17} aria-hidden="true" />
                )}
                {msg("changePassword")}
              </Button>
            </div>
          </form>
          {newPassword && !passwordsMatch ? (
            <p className="mt-3 text-sm font-bold text-red-700">{msg("passwordMismatch")}</p>
          ) : null}
        </section>

        <section className={ui.card}>
          <div className={ui.cardHeader}>
            <div>
              <h2 className={ui.sectionTitle}>{msg("activeSessions")}</h2>
              <p className={ui.muted}>Revoke sessions that should no longer have account access.</p>
            </div>
            <Button type="button" onClick={() => void loadSecuritySettings()}>
              <RefreshCw size={17} aria-hidden="true" />
              Refresh
            </Button>
          </div>

          {snapshot?.sessions.length ? (
            <ul className={ui.list}>
              {snapshot.sessions.map((session) => (
                <li className={ui.item} key={session.id}>
                  <div className={ui.itemMain}>
                    <h3 className={ui.itemTitle}>
                      Session {session.id.slice(0, 8)}
                      {session.current ? (
                        <span className={cn(ui.badge, ui.badgeReady)}>Current</span>
                      ) : null}
                    </h3>
                    <p className={ui.itemMeta}>
                      Created {formatDateTime(session.createdAt)} · Expires{" "}
                      {formatDateTime(session.expiresAt)}
                    </p>
                    {session.rotatedAt ? (
                      <p className={ui.itemMeta}>Rotated {formatDateTime(session.rotatedAt)}</p>
                    ) : null}
                  </div>
                  <Button
                    variant="danger"
                    type="button"
                    disabled={revokingSessionId === session.id}
                    onClick={() => void revokeSession(session.id)}
                  >
                    {revokingSessionId === session.id ? (
                      <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 size={17} aria-hidden="true" />
                    )}
                    {msg("revoke")}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={ui.empty}>No active sessions found.</p>
          )}
        </section>

        <section className={ui.card}>
          <h2 className={ui.sectionTitle}>{msg("securityEventHistory")}</h2>
          {snapshot?.auditEvents.length ? (
            <ul className={ui.list}>
              {snapshot.auditEvents.map((event) => (
                <li className={ui.item} key={event.id}>
                  <div className={ui.itemMain}>
                    <h3 className={ui.itemTitle}>{formatAction(event.action)}</h3>
                    <p className={ui.itemMeta}>{formatDateTime(event.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className={ui.empty}>No security events recorded yet.</p>
          )}
        </section>
      </div>
    </section>
  );
}

function formatAction(action: string): string {
  return action
    .replace(/^security\./, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
