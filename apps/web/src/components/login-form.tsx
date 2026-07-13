"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactElement } from "react";

export function LoginForm({ nextPath }: { nextPath: string }): ReactElement {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submitLogin(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, next: nextPath }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        data?: { redirectTo?: string };
        error?: { message: string };
      };

      if (!response.ok || !payload.ok) {
        setError(payload.error?.message ?? "Login failed.");
        return;
      }

      globalThis.location.assign(payload.data?.redirectTo ?? nextPath);
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitLogin} className="space-y-4" noValidate>
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

      <div className="flex items-center justify-between text-sm">
        <Link className="font-semibold text-primary hover:underline" href="/forgot-password">
          Forgot password?
        </Link>
        <Link className="font-semibold text-primary hover:underline" href="/register">
          Create account
        </Link>
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-semibold text-ink">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
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
        {submitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
