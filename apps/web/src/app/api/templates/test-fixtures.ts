export function createDefinition() {
  return {
    profile: {
      colors: [{ hex: "#0F766E", name: "Primary teal", role: "Primary" }],
      fonts: [{ family: "Inter", role: "Body", weight: "600" }],
      layoutRules: ["Keep headlines short."],
      logos: [],
      previewCards: [],
      sourceEvidence: ["Created for the templates workflow."],
    },
    slides: [],
  };
}

export function createAssetRecord(overrides: { archivedAt?: Date | null; version?: number } = {}) {
  const version = overrides.version ?? 2;
  return {
    id: "asset-1",
    name: "Board template",
    description: "Executive reporting style",
    kind: "TEMPLATE",
    sourceType: "manual",
    archivedAt: overrides.archivedAt ?? null,
    createdAt: new Date("2026-07-10T08:00:00.000Z"),
    updatedAt: new Date("2026-07-10T09:00:00.000Z"),
    _count: { presentations: 4 },
    versions: [
      {
        id: `version-${version}`,
        version,
        definition: createDefinition(),
        createdAt: new Date("2026-07-10T09:00:00.000Z"),
      },
    ],
  };
}
