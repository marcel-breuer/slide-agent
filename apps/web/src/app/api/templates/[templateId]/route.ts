import { prisma } from "@slide-agent/database";

import { ReusableAssetUpdateSchema, fail, ok } from "@/lib/api";
import { buildReusableAssetDefinition, serializeReusableAsset } from "@/lib/reusable-assets";
import { getAuthenticatedUserId } from "@/lib/server-session";

import { reusableAssetSelect } from "../route";

type RouteContext = {
  params: Promise<{
    templateId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  const { templateId } = await context.params;
  const asset = await prisma.reusableAsset.findFirst({
    where: { id: templateId, ownerId: userId },
    select: reusableAssetSelect(),
  });

  if (!asset) return fail("REUSABLE_ASSET_NOT_FOUND", "Template was not found.", 404);
  return ok(serializeReusableAsset(asset));
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

  const parsed = ReusableAssetUpdateSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Template update is invalid.", 400);

  const { templateId } = await context.params;
  const currentAsset = await prisma.reusableAsset.findFirst({
    where: { id: templateId, ownerId: userId },
    select: {
      id: true,
      versions: {
        orderBy: { version: "desc" },
        select: { version: true },
        take: 1,
      },
    },
  });
  if (!currentAsset) return fail("REUSABLE_ASSET_NOT_FOUND", "Template was not found.", 404);

  await prisma.reusableAsset.updateMany({
    where: { id: templateId, ownerId: userId },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description?.trim() ? parsed.data.description : null }
        : {}),
      ...(parsed.data.kind !== undefined ? { kind: parsed.data.kind } : {}),
      ...(parsed.data.archived !== undefined
        ? { archivedAt: parsed.data.archived ? new Date() : null }
        : {}),
    },
  });

  if (parsed.data.definition) {
    await prisma.reusableAssetVersion.create({
      data: {
        reusableAssetId: templateId,
        version: (currentAsset.versions[0]?.version ?? 0) + 1,
        definition: buildReusableAssetDefinition(parsed.data.definition),
      },
    });
  }

  const asset = await prisma.reusableAsset.findFirst({
    where: { id: templateId, ownerId: userId },
    select: reusableAssetSelect(),
  });
  if (!asset) return fail("REUSABLE_ASSET_NOT_FOUND", "Template was not found.", 404);

  return ok(serializeReusableAsset(asset));
}
