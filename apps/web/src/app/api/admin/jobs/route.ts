import { ok } from "@/lib/api";

export function GET() {
  return ok({ active: 0, failed: 0, queued: 0 });
}
