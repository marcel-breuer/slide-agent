import { cookies } from "next/headers";

import { ensureDemoPresentation, findPresentationDocument, prisma } from "@slide-agent/database";
import { DEMO_PRESENTATION_ID } from "@slide-agent/presentation-schema";

import { fail, ok } from "@/lib/api";
import { SESSION_COOKIE_NAME } from "@/lib/auth-session";

type RouteContext = {
  params: Promise<{
    presentationId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const cookieStore = await cookies();
  if (!cookieStore.get(SESSION_COOKIE_NAME)?.value) {
    return fail("UNAUTHORIZED", "A valid session is required.", 401);
  }

  const { presentationId } = await context.params;
  if (presentationId === DEMO_PRESENTATION_ID) {
    await ensureDemoPresentation(prisma);
  }

  const document = await findPresentationDocument(prisma, presentationId);
  if (!document) return fail("PRESENTATION_NOT_FOUND", "Presentation was not found.", 404);

  return ok(document);
}
