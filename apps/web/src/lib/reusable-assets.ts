import type { Prisma } from "@slide-agent/database";

import { ReusableAssetDefinitionSchema } from "@/lib/api";

import type { z } from "zod";

export type ReusableAssetDefinition = z.infer<typeof ReusableAssetDefinitionSchema>;

type ReusableAssetRecord = {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  sourceType: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    presentations: number;
  };
  versions: Array<{
    id: string;
    version: number;
    definition: Prisma.JsonValue;
    createdAt: Date;
  }>;
};

export function buildReusableAssetDefinition(
  definition: ReusableAssetDefinition,
): Prisma.InputJsonValue {
  return {
    profile: definition.profile,
    slides: definition.slides,
  };
}

export function serializeReusableAsset(asset: ReusableAssetRecord) {
  const latestVersion = asset.versions[0];
  const compatibilityWarnings = latestVersion
    ? getCompatibilityWarnings(latestVersion.definition)
    : ["This asset has no usable version yet."];

  return {
    id: asset.id,
    name: asset.name,
    description: asset.description,
    kind: asset.kind,
    sourceType: asset.sourceType,
    archivedAt: asset.archivedAt?.toISOString() ?? null,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    usageCount: asset._count?.presentations ?? 0,
    activeVersion: latestVersion
      ? {
          id: latestVersion.id,
          version: latestVersion.version,
          definition: latestVersion.definition,
          createdAt: latestVersion.createdAt.toISOString(),
          compatibilityWarnings,
        }
      : null,
    versions: asset.versions.map((version) => ({
      id: version.id,
      version: version.version,
      createdAt: version.createdAt.toISOString(),
    })),
  };
}

function getCompatibilityWarnings(definition: Prisma.JsonValue): string[] {
  const parsed = ReusableAssetDefinitionSchema.safeParse(definition);
  if (!parsed.success)
    return ["This asset definition is no longer compatible with the presentation schema."];

  const warnings: string[] = [];
  if (parsed.data.profile.colors.length === 0) {
    warnings.push("No brand colors are defined; default theme colors will be used.");
  }
  if (parsed.data.profile.fonts.length === 0) {
    warnings.push("No brand fonts are defined; default theme fonts will be used.");
  }
  if (parsed.data.slides.length === 0) {
    warnings.push("No reusable slide structures are defined; default layouts will be used.");
  }
  return warnings;
}
