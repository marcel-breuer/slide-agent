import { prisma, type Prisma } from "@slide-agent/database";

export type PresentationWorkflow = Awaited<ReturnType<typeof getPresentationWorkflow>>;

export async function getPresentationWorkflow(userId: string, presentationId: string) {
  const presentation = await prisma.presentation.findFirst({
    where: { id: presentationId, ownerId: userId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      requestedSlideCount: true,
      outputLanguage: true,
      lastExportAt: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      project: {
        select: {
          id: true,
          name: true,
        },
      },
      slides: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          document: true,
        },
      },
      briefings: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: {
          id: true,
          answers: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      storylines: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          method: true,
          rationale: true,
          createdAt: true,
          versions: {
            orderBy: { version: "desc" },
            take: 1,
            select: {
              id: true,
              version: true,
              outline: true,
              approvedAt: true,
              createdAt: true,
            },
          },
        },
      },
      exports: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          report: true,
          createdAt: true,
        },
      },
    },
  });

  if (!presentation) return null;

  return {
    id: presentation.id,
    title: presentation.title,
    description: presentation.description,
    status: presentation.status,
    requestedSlideCount: presentation.requestedSlideCount,
    outputLanguage: presentation.outputLanguage,
    archivedAt: presentation.archivedAt?.toISOString() ?? null,
    createdAt: presentation.createdAt.toISOString(),
    updatedAt: presentation.updatedAt.toISOString(),
    lastExportAt: presentation.lastExportAt?.toISOString() ?? null,
    project: presentation.project,
    slideCount: presentation.slides.length,
    slideTitles: presentation.slides.map((slide) => {
      const document = asRecord(slide.document);
      return {
        id: slide.id,
        order: slide.order,
        title: typeof document?.title === "string" ? document.title : `Slide ${slide.order}`,
      };
    }),
    briefing: presentation.briefings[0]
      ? {
          id: presentation.briefings[0].id,
          answers: presentation.briefings[0].answers,
          createdAt: presentation.briefings[0].createdAt.toISOString(),
          updatedAt: presentation.briefings[0].updatedAt.toISOString(),
          readiness: getBriefingReadiness(presentation.briefings[0].answers),
        }
      : null,
    storylines: presentation.storylines.map((storyline) => ({
      id: storyline.id,
      name: storyline.name,
      method: storyline.method,
      rationale: storyline.rationale,
      createdAt: storyline.createdAt.toISOString(),
      latestVersion: storyline.versions[0]
        ? {
            id: storyline.versions[0].id,
            version: storyline.versions[0].version,
            outline: storyline.versions[0].outline,
            approvedAt: storyline.versions[0].approvedAt?.toISOString() ?? null,
            createdAt: storyline.versions[0].createdAt.toISOString(),
            generated: getStorylineGenerated(storyline.versions[0].outline),
            proposalSummary: getStorylineProposalSummary(storyline.versions[0].outline),
            scopeEstimate: getStorylineScopeEstimate(storyline.versions[0].outline),
          }
        : null,
    })),
    exports: presentation.exports.map((exportRecord) => {
      const report = asRecord(exportRecord.report);
      return {
        id: exportRecord.id,
        createdAt: exportRecord.createdAt.toISOString(),
        fileName:
          typeof report?.fileName === "string" ? report.fileName : `${presentation.title}.pptx`,
        byteSize: typeof report?.byteSize === "number" ? report.byteSize : null,
        slideCount: typeof report?.slideCount === "number" ? report.slideCount : null,
        downloadUrl: `/api/presentations/${encodeURIComponent(
          presentation.id,
        )}/exports/${encodeURIComponent(exportRecord.id)}/download`,
      };
    }),
  };
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getBriefingReadiness(value: Prisma.JsonValue) {
  const record = asRecord(value);
  const readiness = asRecord(record?.readiness as Prisma.JsonValue);

  return {
    approved: readiness?.approved === true,
    answeredFollowUps:
      typeof readiness?.answeredFollowUps === "number" ? readiness.answeredFollowUps : 0,
    referenceCount: typeof readiness?.referenceCount === "number" ? readiness.referenceCount : 0,
    score: typeof readiness?.score === "number" ? readiness.score : 0,
  };
}

function getStorylineGenerated(value: unknown): boolean {
  const record =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  return record?.generated === true;
}

function getStorylineProposalSummary(value: unknown): string | null {
  const record =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  return typeof record?.proposalSummary === "string" ? record.proposalSummary : null;
}

function getStorylineScopeEstimate(value: unknown): {
  confidence: "high" | "low" | "medium";
  estimatedMinutes: number | null;
  slideCount: number | null;
} {
  const record =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const scopeEstimate =
    record?.scopeEstimate !== null &&
    typeof record?.scopeEstimate === "object" &&
    !Array.isArray(record.scopeEstimate)
      ? (record.scopeEstimate as Record<string, unknown>)
      : null;

  const confidence: "high" | "low" | "medium" =
    scopeEstimate?.confidence === "low" ||
    scopeEstimate?.confidence === "medium" ||
    scopeEstimate?.confidence === "high"
      ? scopeEstimate.confidence
      : "medium";

  return {
    confidence,
    estimatedMinutes:
      typeof scopeEstimate?.estimatedMinutes === "number" ? scopeEstimate.estimatedMinutes : null,
    slideCount: typeof scopeEstimate?.slideCount === "number" ? scopeEstimate.slideCount : null,
  };
}
