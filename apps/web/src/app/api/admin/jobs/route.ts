import { ok } from "@/lib/api";
import { getSystemStatus } from "@/lib/ops-status";

export async function GET() {
  const system = await getSystemStatus();

  return ok({
    active: 0,
    failed: 0,
    queued: 0,
    worker: system.dependencies.worker,
  });
}
