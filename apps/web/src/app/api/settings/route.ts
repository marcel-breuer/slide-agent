import { z } from "zod";

import { prisma } from "@slide-agent/database";
import type { Prisma } from "@slide-agent/database";

import { fail, ok } from "@/lib/api";
import { getAuthenticatedUserId } from "@/lib/server-session";

const LocaleSchema = z.enum(["en", "de"]);
const PresentationSettingsSchema = z.object({
  defaultAudience: z.string().trim().min(1).max(120).optional(),
  defaultDetailLevel: z.enum(["concise", "balanced", "detailed"]).optional(),
  defaultExportCompatibility: z.enum(["modern", "strict"]).optional(),
  defaultExportFormat: z.enum(["pptx"]).optional(),
  defaultImageryStyle: z.enum(["none", "minimal", "editorial", "data-driven"]).optional(),
  defaultSlideCount: z.number().int().min(1).max(50).optional(),
  defaultSpeakerNotes: z.enum(["none", "talking-points", "full"]).optional(),
  defaultTone: z.enum(["professional", "executive", "persuasive", "technical"]).optional(),
  hardStopEnabled: z.boolean().optional(),
  monthlyMoneyBudget: z.number().finite().min(0).max(1_000_000).nullable().optional(),
  monthlyTokenBudget: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  personalMaxSlideCount: z.number().int().min(1).max(50).optional(),
  preferredCurrency: z.enum(["EUR", "USD"]).optional(),
  presentationLocale: LocaleSchema.optional(),
  timeZone: z.string().trim().min(1).max(80).optional(),
  uiLocale: LocaleSchema.optional(),
  warningThresholdPercentage: z.number().int().min(1).max(100).optional(),
});
type PresentationSettingsInput = z.infer<typeof PresentationSettingsSchema>;

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  const settings = await ensureUserSettings(userId);
  return ok(toSettingsResponse(settings));
}

export async function PATCH(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }

  const parsed = PresentationSettingsSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Settings input is invalid.", 400);

  const data = parsed.data;
  const maxSlideCount = data.personalMaxSlideCount;
  const defaultSlideCount = data.defaultSlideCount;
  if (
    maxSlideCount !== undefined &&
    defaultSlideCount !== undefined &&
    defaultSlideCount > maxSlideCount
  ) {
    return fail(
      "VALIDATION_FAILED",
      "Default slide count cannot exceed the personal maximum.",
      400,
    );
  }

  const current = await ensureUserSettings(userId);
  const nextDefaultSlideCount =
    defaultSlideCount !== undefined
      ? defaultSlideCount
      : Math.min(current.defaultSlideCount, maxSlideCount ?? current.personalMaxSlideCount);

  const settings = await prisma.userSettings.update({
    where: { userId },
    data: toSettingsUpdateData(data, nextDefaultSlideCount),
  });

  return ok(toSettingsResponse(settings));
}

function toSettingsUpdateData(
  data: PresentationSettingsInput,
  defaultSlideCount: number,
): Prisma.UserSettingsUpdateInput {
  const updateData: Prisma.UserSettingsUpdateInput = { defaultSlideCount };

  if (data.defaultAudience !== undefined) updateData.defaultAudience = data.defaultAudience;
  if (data.defaultDetailLevel !== undefined)
    updateData.defaultDetailLevel = data.defaultDetailLevel;
  if (data.defaultExportCompatibility !== undefined) {
    updateData.defaultExportCompatibility = data.defaultExportCompatibility;
  }
  if (data.defaultExportFormat !== undefined)
    updateData.defaultExportFormat = data.defaultExportFormat;
  if (data.defaultImageryStyle !== undefined)
    updateData.defaultImageryStyle = data.defaultImageryStyle;
  if (data.defaultSpeakerNotes !== undefined)
    updateData.defaultSpeakerNotes = data.defaultSpeakerNotes;
  if (data.defaultTone !== undefined) updateData.defaultTone = data.defaultTone;
  if (data.hardStopEnabled !== undefined) updateData.hardStopEnabled = data.hardStopEnabled;
  if (data.monthlyMoneyBudget !== undefined)
    updateData.monthlyMoneyBudget = data.monthlyMoneyBudget;
  if (data.monthlyTokenBudget !== undefined)
    updateData.monthlyTokenBudget = data.monthlyTokenBudget;
  if (data.personalMaxSlideCount !== undefined) {
    updateData.personalMaxSlideCount = data.personalMaxSlideCount;
  }
  if (data.preferredCurrency !== undefined) updateData.preferredCurrency = data.preferredCurrency;
  if (data.presentationLocale !== undefined)
    updateData.presentationLocale = data.presentationLocale;
  if (data.timeZone !== undefined) updateData.timeZone = data.timeZone;
  if (data.uiLocale !== undefined) updateData.uiLocale = data.uiLocale;
  if (data.warningThresholdPercentage !== undefined) {
    updateData.warningThresholdPercentage = data.warningThresholdPercentage;
  }

  return updateData;
}

async function ensureUserSettings(userId: string) {
  return prisma.userSettings.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

function toSettingsResponse(settings: Awaited<ReturnType<typeof ensureUserSettings>>) {
  return {
    uiLocale: settings.uiLocale,
    presentationLocale: settings.presentationLocale,
    timeZone: settings.timeZone,
    preferredCurrency: settings.preferredCurrency,
    personalMaxSlideCount: settings.personalMaxSlideCount,
    monthlyMoneyBudget: settings.monthlyMoneyBudget ? Number(settings.monthlyMoneyBudget) : null,
    monthlyTokenBudget: settings.monthlyTokenBudget,
    warningThresholdPercentage: settings.warningThresholdPercentage,
    hardStopEnabled: settings.hardStopEnabled,
    defaultSlideCount: settings.defaultSlideCount,
    defaultTone: settings.defaultTone,
    defaultAudience: settings.defaultAudience,
    defaultDetailLevel: settings.defaultDetailLevel,
    defaultSpeakerNotes: settings.defaultSpeakerNotes,
    defaultImageryStyle: settings.defaultImageryStyle,
    defaultExportFormat: settings.defaultExportFormat,
    defaultExportCompatibility: settings.defaultExportCompatibility,
  };
}
