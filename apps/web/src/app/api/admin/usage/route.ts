import { ok } from "@/lib/api";

export function GET() {
  return ok({
    registrations: 0,
    presentationsCreated: 1,
    exportsCreated: 0,
    estimatedCostByProvider: [],
  });
}
