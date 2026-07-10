import { prisma } from "@slide-agent/database";

import { DesignProfileImportSchema, fail, ok } from "@/lib/api";
import {
  buildPreviewJson,
  buildProfileJson,
  buildSourceEvidenceJson,
  serializeDesignProfile,
} from "@/lib/design-profiles";
import { getAuthenticatedUserId } from "@/lib/server-session";

import { profileSelect } from "../route";

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }

  const parsed = DesignProfileImportSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Imported design profile is invalid.", 400);

  const profileJson = buildProfileJson({
    ...parsed.data.profile,
    sourceEvidence: parsed.data.sourceEvidence,
  });
  const profile = await prisma.designProfile.create({
    data: {
      ownerId: userId,
      name: parsed.data.name,
      description: parsed.data.description?.trim() ? parsed.data.description : null,
      sourceType: parsed.data.sourceType,
      sourceEvidence: buildSourceEvidenceJson(parsed.data.sourceEvidence, parsed.data.sourceType),
      preview: buildPreviewJson(parsed.data.profile),
      versions: {
        create: {
          version: 1,
          profile: profileJson,
        },
      },
    },
    select: profileSelect(),
  });

  return ok(serializeDesignProfile(profile), 201);
}
