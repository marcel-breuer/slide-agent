import { AppShell } from "@/components/app-shell";
import { cn, ui } from "@/components/ui";
import { getSystemStatus, type DependencyStatus } from "@/lib/ops-status";

export default async function AdminSystemPage() {
  const system = await getSystemStatus();
  const entries = [
    ["Postgres", system.dependencies.postgres],
    ["Redis", system.dependencies.redis],
    ["Object storage", system.dependencies.storage],
    ["Worker", system.dependencies.worker],
  ] as const;

  return (
    <AppShell>
      <section className={ui.pageShell}>
        <div className={ui.pageHeader}>
          <div>
            <p className={ui.kicker}>Operations</p>
            <h1 className={ui.title}>System status</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Web, worker, Postgres, Redis, and storage health from live dependency checks.
            </p>
          </div>
          <span
            className={cn(
              "inline-flex min-h-10 items-center rounded-lg border px-3.5 text-sm font-extrabold uppercase",
              statusClasses(system.status),
            )}
          >
            {system.status}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {entries.map(([label, check]) => (
            <article className={ui.card} key={label}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="m-0 text-base font-extrabold text-ink">{label}</h2>
                  <p className={ui.itemMeta}>{check.latencyMs} ms latency</p>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-extrabold uppercase",
                    statusClasses(check.status),
                  )}
                >
                  {check.status}
                </span>
              </div>
              <dl className="grid gap-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="font-bold text-muted">Checked</dt>
                  <dd className="m-0 font-semibold text-ink">{check.checkedAt}</dd>
                </div>
                {check.detail ? (
                  <div className="grid gap-1">
                    <dt className="font-bold text-muted">Detail</dt>
                    <dd className="m-0 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm font-bold text-amber-900">
                      {check.detail}
                    </dd>
                  </div>
                ) : null}
                {"heartbeat" in check && check.heartbeat ? (
                  <div className="grid gap-1">
                    <dt className="font-bold text-muted">Heartbeat</dt>
                    <dd className="m-0 rounded-lg border border-line bg-canvas p-2 text-sm font-semibold text-ink">
                      {check.heartbeat.queueName ?? "worker"} updated at {check.heartbeat.updatedAt}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function statusClasses(status: DependencyStatus): string {
  if (status === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "degraded") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-800";
}
