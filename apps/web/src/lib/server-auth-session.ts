import { createHash, randomBytes } from "node:crypto";

import { cookies } from "next/headers";

import { prisma } from "@slide-agent/database";

import {
  readSessionTokenFromCookie,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "./auth-session";

export type AuthenticatedSession = {
  email: string;
  role: "USER" | "ADMIN";
  sessionId: string;
  userId: string;
};

type SessionRecord = {
  id: string;
  expiresAt: Date;
  user: {
    deletedAt: Date | null;
    email: string;
    id: string;
    role: "USER" | "ADMIN";
    suspendedAt: Date | null;
  };
};

export type SessionClient = {
  session: {
    create(args: {
      data: {
        expiresAt: Date;
        tokenHash: string;
        userId: string;
      };
      select: { id: true };
    }): Promise<{ id: string }>;
    deleteMany(args: {
      where: { tokenHash?: string; expiresAt?: { lte: Date } };
    }): Promise<unknown>;
    findUnique(args: {
      where: { tokenHash: string };
      include: {
        user: {
          select: {
            deletedAt: true;
            email: true;
            id: true;
            role: true;
            suspendedAt: true;
          };
        };
      };
    }): Promise<SessionRecord | null>;
  };
};

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createUserSession(
  userId: string,
  {
    client = prisma,
    now = new Date(),
    token = createSessionToken(),
  }: {
    client?: SessionClient;
    now?: Date;
    token?: string;
  } = {},
): Promise<{ expiresAt: Date; sessionId: string; token: string }> {
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
  const session = await client.session.create({
    data: {
      expiresAt,
      tokenHash: hashSessionToken(token),
      userId,
    },
    select: { id: true },
  });

  return { expiresAt, sessionId: session.id, token };
}

export async function resolveSessionToken(
  token: string | undefined,
  {
    client = prisma,
    now = new Date(),
  }: {
    client?: SessionClient;
    now?: Date;
  } = {},
): Promise<AuthenticatedSession | null> {
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const session = await client.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          deletedAt: true,
          email: true,
          id: true,
          role: true,
          suspendedAt: true,
        },
      },
    },
  });

  if (!session) return null;

  if (session.expiresAt <= now) {
    await client.session.deleteMany({ where: { tokenHash } });
    return null;
  }

  if (session.user.deletedAt || session.user.suspendedAt) {
    return null;
  }

  return {
    email: session.user.email,
    role: session.user.role,
    sessionId: session.id,
    userId: session.user.id,
  };
}

export async function getAuthenticatedSession(): Promise<AuthenticatedSession | null> {
  const cookieStore = await cookies();
  const token = await readSessionTokenFromCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  return resolveSessionToken(token ?? undefined);
}

export async function revokeSessionToken(
  token: string | undefined,
  { client = prisma }: { client?: SessionClient } = {},
): Promise<void> {
  if (!token) return;
  await client.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}

export async function revokeExpiredSessions({
  client = prisma,
  now = new Date(),
}: { client?: SessionClient; now?: Date } = {}): Promise<void> {
  await client.session.deleteMany({ where: { expiresAt: { lte: now } } });
}
