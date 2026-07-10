import { prisma } from "@slide-agent/database";
import type { Prisma } from "@slide-agent/database";
import { z } from "zod";

import { fail, ok } from "@/lib/api";
import { getAuthenticatedSession } from "@/lib/server-auth-session";

const ProfileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(120).nullable().optional(),
  preferredCurrency: z.enum(["EUR", "USD"]).optional(),
  timeZone: z.string().trim().min(1).max(80).optional(),
});

const AccountDeletionSchema = z.object({
  confirmation: z.literal("DELETE_ACCOUNT"),
  email: z.string().email(),
});

type ProfileSettings = {
  preferredCurrency: string;
  timeZone: string;
};

type ProfileUser = {
  createdAt: Date;
  displayName: string | null;
  email: string;
  id: string;
  settings: ProfileSettings | null;
  updatedAt: Date;
};

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  const profile = await loadProfile(session.userId);
  if (!profile) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  return ok(toProfileResponse(profile));
}

export async function PATCH(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }

  const parsed = ProfileUpdateSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Profile input is invalid.", 400);

  await prisma.user.update({
    data: toUserUpdateData(parsed.data),
    where: { id: session.userId },
  });

  if (parsed.data.preferredCurrency !== undefined || parsed.data.timeZone !== undefined) {
    await prisma.userSettings.upsert({
      create: {
        userId: session.userId,
        ...(parsed.data.preferredCurrency !== undefined
          ? { preferredCurrency: parsed.data.preferredCurrency }
          : {}),
        ...(parsed.data.timeZone !== undefined ? { timeZone: parsed.data.timeZone } : {}),
      },
      update: {
        ...(parsed.data.preferredCurrency !== undefined
          ? { preferredCurrency: parsed.data.preferredCurrency }
          : {}),
        ...(parsed.data.timeZone !== undefined ? { timeZone: parsed.data.timeZone } : {}),
      },
      where: { userId: session.userId },
    });
  }

  await prisma.auditLog.create({
    data: {
      action: "account.profile_updated",
      metadata: {
        fields: Object.keys(parsed.data).sort(),
      },
      userId: session.userId,
    },
  });

  const profile = await loadProfile(session.userId);
  if (!profile) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  return ok(toProfileResponse(profile));
}

export async function DELETE(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session) return fail("UNAUTHORIZED", "A valid session is required.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }

  const parsed = AccountDeletionSchema.safeParse(body);
  if (!parsed.success) {
    return fail("VALIDATION_FAILED", "Account deletion requires email and confirmation.", 400);
  }

  if (parsed.data.email.toLowerCase() !== session.email.toLowerCase()) {
    return fail("VALIDATION_FAILED", "Confirmation email does not match this account.", 400);
  }

  const now = new Date();
  const deletedEmail = `deleted-${session.userId}@deleted.slide-agent.local`;

  await prisma.$transaction([
    prisma.auditLog.create({
      data: {
        action: "account.deleted",
        metadata: { sessionId: session.sessionId },
        userId: session.userId,
      },
    }),
    prisma.session.deleteMany({ where: { userId: session.userId } }),
    prisma.providerCredential.deleteMany({ where: { userId: session.userId } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: session.userId } }),
    prisma.emailVerificationToken.deleteMany({ where: { userId: session.userId } }),
    prisma.user.update({
      data: {
        deletedAt: now,
        displayName: null,
        email: deletedEmail,
      },
      where: { id: session.userId },
    }),
  ]);

  return ok({ deleted: true });
}

async function loadProfile(userId: string): Promise<ProfileUser | null> {
  return prisma.user.findUnique({
    select: {
      createdAt: true,
      displayName: true,
      email: true,
      id: true,
      settings: {
        select: {
          preferredCurrency: true,
          timeZone: true,
        },
      },
      updatedAt: true,
    },
    where: { id: userId },
  });
}

function toUserUpdateData(data: z.infer<typeof ProfileUpdateSchema>): Prisma.UserUpdateInput {
  const updateData: Prisma.UserUpdateInput = {};

  if (data.displayName !== undefined) {
    updateData.displayName = data.displayName?.trim() ? data.displayName.trim() : null;
  }

  return updateData;
}

function toProfileResponse(profile: ProfileUser) {
  return {
    createdAt: profile.createdAt.toISOString(),
    displayName: profile.displayName,
    email: profile.email,
    id: profile.id,
    preferredCurrency: profile.settings?.preferredCurrency ?? "EUR",
    timeZone: profile.settings?.timeZone ?? "Europe/Berlin",
    updatedAt: profile.updatedAt.toISOString(),
  };
}
