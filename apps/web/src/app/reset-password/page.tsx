import Link from "next/link";

import { ResetPasswordForm } from "@/components/reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-6 py-10">
      <section className="w-full max-w-md rounded-app border border-line bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
            Slide Agent
          </p>
          <h1 className="text-2xl font-bold text-ink">Reset password</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Choose a new password for your account.
          </p>
        </div>
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <div className="space-y-4">
            <p className="rounded-app bg-red-50 px-3 py-2 text-sm text-red-700">
              This password reset link is missing or invalid.
            </p>
            <Link
              className="block text-center text-sm font-semibold text-primary hover:underline"
              href="/forgot-password"
            >
              Request a new reset link
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
