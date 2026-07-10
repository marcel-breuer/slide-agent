import type { ReactElement } from "react";

import { AppShell } from "./app-shell";
import { cn, ui } from "./ui";

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
      <section className="mx-auto my-8 w-full max-w-[720px] rounded-lg border border-line bg-white p-6 shadow-sm max-[520px]:mx-4">
        <h1 className="m-0 text-2xl font-bold leading-tight text-ink">{title}</h1>
        <p className={cn("mt-3", ui.muted)}>{description}</p>
      </section>
    </AppShell>
  );
}
