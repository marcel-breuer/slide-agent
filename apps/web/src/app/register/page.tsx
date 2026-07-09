import { RegisterForm } from "@/components/register-form";

export default function RegisterPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-6 py-10">
      <section className="w-full max-w-md rounded-app border border-line bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
            Slide Agent
          </p>
          <h1 className="text-2xl font-bold text-ink">Create account</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Create an account for the private workspace.
          </p>
        </div>
        <RegisterForm />
      </section>
    </main>
  );
}
