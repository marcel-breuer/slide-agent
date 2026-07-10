import { z } from "zod";

import { prisma } from "@slide-agent/database";

import { DesignProfileDefinitionSchema, fail, ok } from "@/lib/api";
import {
  buildPreviewJson,
  buildProfileJson,
  buildSourceEvidenceJson,
  serializeDesignProfile,
} from "@/lib/design-profiles";
import { getAuthenticatedUserId } from "@/lib/server-session";

import { profileSelect } from "../route";

type RouteContext = {
  params: Promise<{
    profileId: string;
  }>;
};

const DesignProfileUpdateSchema = z
  .object({
    archived: z.boolean().optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    name: z.string().trim().min(1).max(160).optional(),
    profile: DesignProfileDefinitionSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0);

export async function GET(_request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  const { profileId } = await context.params;
  const profile = await prisma.designProfile.findFirst({
    where: { id: profileId, ownerId: userId },
    select: profileSelect(),
  });

  if (!profile) return fail("DESIGN_PROFILE_NOT_FOUND", "Design profile was not found.", 404);

  return ok(serializeDesignProfile(profile));
}

export async function PATCH(request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }

  const parsed = DesignProfileUpdateSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Design profile update is invalid.", 400);

  const { profileId } = await context.params;
  const currentProfile = await prisma.designProfile.findFirst({
    where: { id: profileId, ownerId: userId },
    select: {
      id: true,
      sourceType: true,
      versions: {
        orderBy: { version: "desc" },
        select: { version: true },
        take: 1,
      },
    },
  });
  if (!currentProfile) {
    return fail("DESIGN_PROFILE_NOT_FOUND", "Design profile was not found.", 404);
  }

  const updateResult = await prisma.designProfile.updateMany({
    where: { id: profileId, ownerId: userId },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description?.trim() ? parsed.data.description : null }
        : {}),
      ...(parsed.data.archived !== undefined
        ? { archivedAt: parsed.data.archived ? new Date() : null }
        : {}),
      ...(parsed.data.profile
        ? {
            preview: buildPreviewJson(parsed.data.profile),
            sourceEvidence: buildSourceEvidenceJson(
              parsed.data.profile.sourceEvidence,
              currentProfile.sourceType,
            ),
          }
        : {}),
    },
  });

  if (updateResult.count !== 1) {
    return fail("DESIGN_PROFILE_NOT_FOUND", "Design profile was not found.", 404);
  }

  if (parsed.data.profile) {
    await prisma.designProfileVersion.create({
      data: {
        designProfileId: profileId,
        version: (currentProfile.versions[0]?.version ?? 0) + 1,
        profile: buildProfileJson(parsed.data.profile),
      },
    });
  }

  const profile = await prisma.designProfile.findFirst({
    where: { id: profileId, ownerId: userId },
    select: profileSelect(),
  });

  if (!profile) return fail("DESIGN_PROFILE_NOT_FOUND", "Design profile was not found.", 404);

  return ok(serializeDesignProfile(profile));
}
