import type { ReactElement } from "react";

import { AppShell } from "./app-shell";

export function SimpleRoutePage({
  title,
  description,
  protectedRoute: _protectedRoute = false,
}: {
  title: string;
  description: string;
  protectedRoute?: boolean;
}): ReactElement {
  return (
    <AppShell>
      <section className="route-card">
        <h1>{title}</h1>
        <p>{description}</p>
      </section>
    </AppShell>
  );
}
