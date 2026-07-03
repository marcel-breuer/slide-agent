import { enforceSlideLimit } from "@slide-agent/presentation-schema";

import { PresentationInputSchema, fail, ok } from "@/lib/api";

export function GET() {
  return ok([{ id: "demo-presentation", title: "Q3 Operating Review", status: "EDITING" }]);
}

export async function POST(request: Request) {
  const parsed = PresentationInputSchema.safeParse(await request.json());
  if (!parsed.success) return fail("VALIDATION_FAILED", "Presentation input is invalid.");
  return ok(
    {
      id: crypto.randomUUID(),
      ...parsed.data,
      requestedSlideCount: enforceSlideLimit(parsed.data.requestedSlideCount, 50, 50),
      status: "DRAFT",
    },
    201,
  );
}
