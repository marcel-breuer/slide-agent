import type { Prisma } from "@slide-agent/database";

import type { DesignProfileDefinitionSchema } from "@/lib/api";

import type { z } from "zod";

export type DesignProfileDefinition = z.infer<typeof DesignProfileDefinitionSchema>;

type DesignProfileRecord = {
  id: string;
  name: string;
  description: string | null;
  sourceType: string;
  sourceEvidence: Prisma.JsonValue;
  preview: Prisma.JsonValue;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    presentations: number;
  };
  versions: Array<{
    id: string;
    version: number;
    profile: Prisma.JsonValue;
    createdAt: Date;
  }>;
};

export function buildProfileJson(profile: DesignProfileDefinition): Prisma.InputJsonValue {
  return {
    colors: profile.colors,
    fonts: profile.fonts,
    layoutRules: profile.layoutRules,
    logos: profile.logos,
    previewCards: profile.previewCards,
    sourceEvidence: profile.sourceEvidence,
  };
}

export function buildPreviewJson(profile: DesignProfileDefinition): Prisma.InputJsonValue {
  return {
    colors: profile.colors.slice(0, 6),
    fonts: profile.fonts.slice(0, 4),
    previewCards: profile.previewCards.slice(0, 4),
  };
}

export function buildSourceEvidenceJson(
  evidence: string[],
  sourceType: string,
): Prisma.InputJsonValue {
  return {
    items: evidence,
    sourceType,
  };
}

export function serializeDesignProfile(profile: DesignProfileRecord) {
  const latestVersion = profile.versions[0];

  return {
    id: profile.id,
    name: profile.name,
    description: profile.description,
    sourceType: profile.sourceType,
    sourceEvidence: profile.sourceEvidence,
    preview: profile.preview,
    archivedAt: profile.archivedAt?.toISOString() ?? null,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
    usageCount: profile._count?.presentations ?? 0,
    activeVersion: latestVersion
      ? {
          id: latestVersion.id,
          version: latestVersion.version,
          profile: latestVersion.profile,
          createdAt: latestVersion.createdAt.toISOString(),
        }
      : null,
    versions: profile.versions.map((version) => ({
      id: version.id,
      version: version.version,
      profile: version.profile,
      createdAt: version.createdAt.toISOString(),
    })),
  };
}
