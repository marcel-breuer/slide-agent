"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactElement } from "react";

export function RegisterForm(): ReactElement {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submitRegistration(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setRegistered(false);
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim() || undefined,
          email,
          password,
        }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        error?: { message: string };
      };

      if (!response.ok || !payload.ok) {
        setError(payload.error?.message ?? "Registration failed.");
        return;
      }

      setRegistered(true);
      setPassword("");
    } catch {
      setError("Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitRegistration} className="space-y-4" noValidate>
      <div>
        <label htmlFor="displayName" className="mb-1 block text-sm font-semibold text-ink">
          Display name
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          className="h-11 w-full rounded-app border border-line bg-white px-3 text-sm text-ink"
        />
      </div>

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-semibold text-ink">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-11 w-full rounded-app border border-line bg-white px-3 text-sm text-ink"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-semibold text-ink">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-11 w-full rounded-app border border-line bg-white px-3 text-sm text-ink"
        />
      </div>

      {error ? (
        <p className="rounded-app bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      {registered ? (
        <p className="rounded-app bg-green-50 px-3 py-2 text-sm text-green-700">
          Account created. You can sign in now.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="h-11 w-full rounded-app bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-70"
      >
        {submitting ? "Creating account..." : "Create account"}
      </button>
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link className="font-semibold text-primary hover:underline" href="/login">
          Sign in
        </Link>
      </p>
    </form>
  );
}
