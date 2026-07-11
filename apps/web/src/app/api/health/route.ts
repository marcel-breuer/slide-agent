import { getSystemStatus, isSystemReadyForTraffic } from "@/lib/ops-status";
import { logSafe } from "@/lib/safe-logger";

export async function GET() {
  const system = await getSystemStatus();
  const httpStatus = isSystemReadyForTraffic(system) ? 200 : 503;

  if (system.status !== "ok") {
    logSafe(system.status === "down" ? "error" : "warn", "health check degraded", {
      dependencies: system.dependencies,
      status: system.status,
    });
  }

  return Response.json(
    {
      service: "slide-agent-web",
      status: system.status,
      system,
      timestamp: system.checkedAt,
    },
    { status: httpStatus },
  );
}
