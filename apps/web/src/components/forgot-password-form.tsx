"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactElement } from "react";

export function ForgotPasswordForm(): ReactElement {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submitRequest(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitted(false);
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        body: JSON.stringify({ email }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { ok: boolean; error?: { message: string } };
      if (!response.ok || !payload.ok) {
        setError(payload.error?.message ?? "Password reset request failed.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Password reset request failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitRequest} className="space-y-4" noValidate>
      <div>
        <label htmlFor="forgot-email" className="mb-1 block text-sm font-semibold text-ink">
          Email
        </label>
        <input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-11 w-full rounded-app border border-line bg-white px-3 text-sm text-ink"
        />
      </div>
      {error ? (
        <p className="rounded-app bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {submitted ? (
        <p className="rounded-app bg-green-50 px-3 py-2 text-sm text-green-700">
          If an account exists for this email, a reset link has been sent.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="h-11 w-full rounded-app bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-70"
      >
        {submitting ? "Sending link..." : "Send reset link"}
      </button>
      <p className="text-center text-sm text-muted">
        <Link className="font-semibold text-primary hover:underline" href="/login">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
