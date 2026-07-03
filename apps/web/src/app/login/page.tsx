import { LoginForm } from "@/components/login-form";
import { sanitizeNextPath } from "@/lib/auth-session";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = sanitizeNextPath(params.next);

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-6 py-10">
      <section className="w-full max-w-md rounded-app border border-line bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
            Slide Agent
          </p>
          <h1 className="text-2xl font-bold text-ink">Sign in</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Use the demo credentials to open the private workspace.
          </p>
        </div>
        <LoginForm nextPath={nextPath} />
      </section>
    </main>
  );
}
