import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";

import { createDemoPresentationDocument } from "@slide-agent/presentation-schema";

import {
  buildPresentationDocument,
  findPresentationDocument,
  PresentationVersionConflictError,
  savePresentationDocument,
  type PresentationLookupClient,
  type PresentationSaveClient
} from "./presentations";

describe("presentation document lookup", () => {
  it("returns null when the presentation does not exist", async () => {
    const client: PresentationLookupClient = {
      presentation: {
        async findUnique() {
          return null;
        }
      }
    };

    await expect(findPresentationDocument(client, "missing")).resolves.toBeNull();
  });

  it("builds a schema-valid document from presentation and slide rows", async () => {
    const now = new Date("2026-07-02T10:00:00.000Z");
    const demo = createDemoPresentationDocument({ ownerId: "user-1", now: now.toISOString() });
    const client: PresentationLookupClient = {
      presentation: {
        async findUnique() {
          return {
            id: demo.id,
            ownerId: "user-1",
            title: demo.title,
            format: demo.format,
            outputLanguage: demo.locale,
            designContext: { theme: demo.theme },
            createdAt: now,
            updatedAt: now,
            slides: demo.slides.map((slide) => ({
              id: slide.id,
              order: slide.order,
              document: slide
            }))
          };
        }
      }
    };

    const document = await findPresentationDocument(client, demo.id);

    expect(document?.id).toBe("demo-presentation");
    expect(document?.metadata.ownerId).toBe("user-1");
    expect(document?.slides).toHaveLength(1);
    expect(document?.slides[0]?.title).toBe("Executive summary");
  });

  it("falls back to safe presentation-level values before schema validation", () => {
    const now = new Date("2026-07-02T10:00:00.000Z");
    const demo = createDemoPresentationDocument({ ownerId: "user-1", now: now.toISOString() });

    const document = buildPresentationDocument({
      id: demo.id,
      ownerId: "user-1",
      title: demo.title,
      format: "UNKNOWN",
      outputLanguage: "fr",
      designContext: null,
      createdAt: now,
      updatedAt: now,
      slides: demo.slides.map((slide) => ({
        id: slide.id,
        order: slide.order,
        document: slide
      }))
    });

    expect(document.format).toBe("WIDE_16_9");
    expect(document.locale).toBe("en");
  });

  it("saves a valid document when the loaded version matches", async () => {
    const now = new Date("2026-07-02T10:00:00.000Z");
    const later = new Date("2026-07-02T10:01:00.000Z");
    const demo = createDemoPresentationDocument({ ownerId: "user-1", now: now.toISOString() });
    const updatedDocument = {
      ...demo,
      slides: demo.slides.map((slide) =>
        slide.id === "slide-1"
          ? {
              ...slide,
              pointers: [
                {
                  id: "pointer-1",
                  instruction: "Make the metric clearer",
                  label: "1",
                  x: 240,
                  y: 180
                }
              ],
              title: "Updated title"
            }
          : slide
      )
    };
    const client = createInMemorySaveClient({
      createdAt: now,
      designContext: { theme: demo.theme },
      format: demo.format,
      id: demo.id,
      outputLanguage: demo.locale,
      ownerId: "user-1",
      slides: demo.slides.map((slide) => ({
        document: slide,
        id: slide.id,
        order: slide.order
      })),
      title: demo.title,
      updatedAt: now
    }, later);

    const saved = await savePresentationDocument(client, {
      document: updatedDocument,
      expectedUpdatedAt: now.toISOString(),
      presentationId: demo.id
    });

    expect(saved.metadata.updatedAt).toBe(later.toISOString());
    expect(saved.slides[0]?.title).toBe("Updated title");
    expect(saved.slides[0]?.pointers).toEqual([
      {
        id: "pointer-1",
        instruction: "Make the metric clearer",
        label: "1",
        x: 240,
        y: 180
      }
    ]);
  });

  it("rejects stale document saves", async () => {
    const now = new Date("2026-07-02T10:00:00.000Z");
    const stale = new Date("2026-07-02T09:59:00.000Z");
    const demo = createDemoPresentationDocument({ ownerId: "user-1", now: now.toISOString() });
    const client = createInMemorySaveClient({
      createdAt: now,
      designContext: { theme: demo.theme },
      format: demo.format,
      id: demo.id,
      outputLanguage: demo.locale,
      ownerId: "user-1",
      slides: demo.slides.map((slide) => ({
        document: slide,
        id: slide.id,
        order: slide.order
      })),
      title: demo.title,
      updatedAt: now
    });

    await expect(
      savePresentationDocument(client, {
        document: demo,
        expectedUpdatedAt: stale.toISOString(),
        presentationId: demo.id
      })
    ).rejects.toBeInstanceOf(PresentationVersionConflictError);
  });
});

function createInMemorySaveClient(
  initial: Awaited<ReturnType<PresentationLookupClient["presentation"]["findUnique"]>>,
  nextUpdatedAt = new Date("2026-07-02T10:01:00.000Z")
): PresentationSaveClient {
  if (!initial) throw new Error("Initial record is required.");
  let record = initial;

  const client: PresentationSaveClient = {
    async $transaction(callback) {
      return callback(client);
    },
    presentation: {
      async findUnique() {
        return record;
      },
      async updateMany(args) {
        if (args.where.updatedAt.getTime() !== record.updatedAt.getTime()) {
          return { count: 0 };
        }

        record = {
          ...record,
          designContext: args.data.designContext as Prisma.JsonValue,
          format: args.data.format,
          outputLanguage: args.data.outputLanguage,
          title: args.data.title,
          updatedAt: nextUpdatedAt
        };
        return { count: 1 };
      }
    },
    slide: {
      async createMany(args) {
        record = {
          ...record,
          slides: args.data.map((slide) => ({
            document: slide.document as Prisma.JsonValue,
            id: slide.id,
            order: slide.order
          }))
        };
      },
      async deleteMany() {
        record = {
          ...record,
          slides: []
        };
      }
    }
  };

  return client;
}
