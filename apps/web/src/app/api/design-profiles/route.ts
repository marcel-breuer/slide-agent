import { prisma } from "@slide-agent/database";

import { DesignProfileInputSchema, fail, ok } from "@/lib/api";
import {
  buildPreviewJson,
  buildProfileJson,
  buildSourceEvidenceJson,
  serializeDesignProfile,
} from "@/lib/design-profiles";
import { getAuthenticatedUserId } from "@/lib/server-session";

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  const searchParams = new URL(request.url).searchParams;
  const includeArchived = searchParams.get("includeArchived") === "true";
  const query = searchParams.get("query")?.trim();

  const profiles = await prisma.designProfile.findMany({
    where: {
      ownerId: userId,
      ...(includeArchived ? {} : { archivedAt: null }),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ archivedAt: "asc" }, { updatedAt: "desc" }],
    select: profileSelect(),
  });

  return ok(profiles.map(serializeDesignProfile));
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }

  const parsed = DesignProfileInputSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Design profile input is invalid.", 400);

  const profileJson = buildProfileJson(parsed.data.profile);
  const profile = await prisma.designProfile.create({
    data: {
      ownerId: userId,
      name: parsed.data.name,
      description: parsed.data.description?.trim() ? parsed.data.description : null,
      sourceType: "manual",
      sourceEvidence: buildSourceEvidenceJson(parsed.data.profile.sourceEvidence, "manual"),
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

export function profileSelect() {
  return {
    id: true,
    name: true,
    description: true,
    sourceType: true,
    sourceEvidence: true,
    preview: true,
    archivedAt: true,
    createdAt: true,
    updatedAt: true,
    _count: {
      select: {
        presentations: true,
      },
    },
    versions: {
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        profile: true,
        createdAt: true,
      },
    },
  } as const;
}
