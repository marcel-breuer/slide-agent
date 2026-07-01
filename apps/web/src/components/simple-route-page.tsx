import type { ReactElement } from "react";

export function SimpleRoutePage({
  title,
  description,
  protectedRoute = false
}: {
  title: string;
  description: string;
  protectedRoute?: boolean;
}): ReactElement {
  return (
    <main className="min-h-screen bg-canvas px-6 py-8">
      <section className="mx-auto max-w-3xl rounded-app border border-line bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-ink">{title}</h1>
          {protectedRoute ? (
            <span className="rounded-app bg-teal/10 px-2 py-1 text-xs font-semibold text-teal">Protected</span>
          ) : null}
        </div>
        <p className="text-sm leading-6 text-muted">{description}</p>
      </section>
    </main>
  );
}
