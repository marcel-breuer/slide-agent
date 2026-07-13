"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactElement } from "react";

export function ResetPasswordForm({ token }: { token: string }): ReactElement {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submitReset(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        body: JSON.stringify({ password, token }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { ok: boolean; error?: { message: string } };
      if (!response.ok || !payload.ok) {
        setError(payload.error?.message ?? "Password reset failed.");
        return;
      }
      setCompleted(true);
      setPassword("");
      setConfirmation("");
    } catch {
      setError("Password reset failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (completed) {
    return (
      <div className="space-y-4">
        <p className="rounded-app bg-green-50 px-3 py-2 text-sm text-green-700">
          Your password has been reset. You can sign in with the new password.
        </p>
        <Link
          className="block text-center text-sm font-semibold text-primary hover:underline"
          href="/login"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submitReset} className="space-y-4" noValidate>
      <div>
        <label htmlFor="reset-password" className="mb-1 block text-sm font-semibold text-ink">
          New password
        </label>
        <input
          id="reset-password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-11 w-full rounded-app border border-line bg-white px-3 text-sm text-ink"
        />
      </div>
      <div>
        <label
          htmlFor="reset-password-confirmation"
          className="mb-1 block text-sm font-semibold text-ink"
        >
          Confirm new password
        </label>
        <input
          id="reset-password-confirmation"
          type="password"
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          className="h-11 w-full rounded-app border border-line bg-white px-3 text-sm text-ink"
        />
      </div>
      {error ? (
        <p className="rounded-app bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="h-11 w-full rounded-app bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-70"
      >
        {submitting ? "Resetting password..." : "Reset password"}
      </button>
    </form>
  );
}
