import { ProjectInputSchema, fail, ok } from "@/lib/api";

export function GET() {
  return ok([{ id: "project-demo", name: "Board reporting", archivedAt: null }]);
}

export async function POST(request: Request) {
  const parsed = ProjectInputSchema.safeParse(await request.json());
  if (!parsed.success) return fail("VALIDATION_FAILED", "Project input is invalid.");
  return ok({ id: crypto.randomUUID(), ...parsed.data }, 201);
}
