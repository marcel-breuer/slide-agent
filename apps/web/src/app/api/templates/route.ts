import { prisma } from "@slide-agent/database";

import { ReusableAssetInputSchema, fail, ok } from "@/lib/api";
import { buildReusableAssetDefinition, serializeReusableAsset } from "@/lib/reusable-assets";
import { getAuthenticatedUserId } from "@/lib/server-session";

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  const searchParams = new URL(request.url).searchParams;
  const includeArchived = searchParams.get("includeArchived") === "true";
  const kind = searchParams.get("kind");
  const query = searchParams.get("query")?.trim();

  const assets = await prisma.reusableAsset.findMany({
    where: {
      ownerId: userId,
      ...(includeArchived ? {} : { archivedAt: null }),
      ...(kind === "TEMPLATE" || kind === "BRAND_KIT" ? { kind } : {}),
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
    select: reusableAssetSelect(),
  });

  return ok(assets.map(serializeReusableAsset));
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

  const parsed = ReusableAssetInputSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Template input is invalid.", 400);

  const asset = await prisma.reusableAsset.create({
    data: {
      ownerId: userId,
      name: parsed.data.name,
      description: parsed.data.description?.trim() ? parsed.data.description : null,
      kind: parsed.data.kind,
      sourceType: "manual",
      versions: {
        create: {
          version: 1,
          definition: buildReusableAssetDefinition(parsed.data.definition),
        },
      },
    },
    select: reusableAssetSelect(),
  });

  return ok(serializeReusableAsset(asset), 201);
}

export function reusableAssetSelect() {
  return {
    id: true,
    name: true,
    description: true,
    kind: true,
    sourceType: true,
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
        definition: true,
        createdAt: true,
      },
    },
  } as const;
}
