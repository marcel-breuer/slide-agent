import { ok } from "@/lib/api";
import { getSystemStatus } from "@/lib/ops-status";
import { logSafe } from "@/lib/safe-logger";

export async function GET() {
  const system = await getSystemStatus();

  if (system.status !== "ok") {
    logSafe(system.status === "down" ? "error" : "warn", "admin system status degraded", {
      dependencies: system.dependencies,
      status: system.status,
    });
  }

  return ok({
    checkedAt: system.checkedAt,
    dependencies: system.dependencies,
    status: system.status,
  });
}
