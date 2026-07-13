import { prisma } from "@slide-agent/database";

import { ReusableAssetImportSchema, fail, ok } from "@/lib/api";
import { buildReusableAssetDefinition, serializeReusableAsset } from "@/lib/reusable-assets";
import { getAuthenticatedUserId } from "@/lib/server-session";

import { reusableAssetSelect } from "../route";

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }

  const parsed = ReusableAssetImportSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Imported template is invalid.", 400);

  const asset = await prisma.reusableAsset.create({
    data: {
      ownerId: userId,
      name: parsed.data.name,
      description: parsed.data.description?.trim() ? parsed.data.description : null,
      kind: parsed.data.kind,
      sourceType: parsed.data.sourceType,
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
