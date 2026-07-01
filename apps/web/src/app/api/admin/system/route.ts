import { ok } from "@/lib/api";

export function GET() {
  return ok({
    web: "ok",
    worker: "unknown",
    postgres: "configured",
    redis: "configured",
    objectStorage: "configured",
    email: "configured"
  });
}
