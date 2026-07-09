import { z } from "zod";

import { hashPassword } from "@slide-agent/auth";
import { prisma } from "@slide-agent/database";

import { fail, ok } from "@/lib/api";

const RegisterSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  email: z.string().email(),
  password: z.string(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_FAILED", "Request body must be valid JSON.", 400);
  }

  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_FAILED", "The registration request is invalid.");

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(parsed.data.password);
  } catch {
    return fail("WEAK_PASSWORD", "Password does not meet the strength policy.", 400);
  }

  try {
    const displayName = parsed.data.displayName ?? null;
    const user = await prisma.user.create({
      data: {
        displayName,
        email: parsed.data.email.trim().toLowerCase(),
        passwordHash,
        settings: {
          create: {},
        },
      },
      select: {
        id: true,
      },
    });

    return ok({ userId: user.id, verificationRequired: true }, 201);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return fail("EMAIL_ALREADY_REGISTERED", "An account with this email already exists.", 409);
    }

    return fail("REGISTRATION_FAILED", "Account could not be created.", 500);
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
