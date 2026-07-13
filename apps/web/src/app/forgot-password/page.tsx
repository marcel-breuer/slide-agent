import Link from "next/link";

import { ForgotPasswordForm } from "@/components/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-6 py-10">
      <section className="w-full max-w-md rounded-app border border-line bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
            Slide Agent
          </p>
          <h1 className="text-2xl font-bold text-ink">Forgot password</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            We will email you a secure reset link.
          </p>
        </div>
        <ForgotPasswordForm />
        <p className="mt-4 text-center text-sm text-muted">
          Need an account?{" "}
          <Link className="font-semibold text-primary hover:underline" href="/register">
            Create one
          </Link>
        </p>
      </section>
    </main>
  );
}
