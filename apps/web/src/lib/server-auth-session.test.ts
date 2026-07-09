import { describe, expect, it, vi } from "vitest";

import {
  createUserSession,
  hashSessionToken,
  resolveSessionToken,
  revokeSessionToken,
  type SessionClient,
} from "./server-auth-session";

describe("server auth session", () => {
  it("stores only hashed session tokens and resolves active users", async () => {
    const client = createSessionClient();
    const created = await createUserSession("user-1", {
      client,
      now: new Date("2026-07-09T10:00:00.000Z"),
      token: "raw-token",
    });

    expect(created.token).toBe("raw-token");
    expect(client.storedTokenHashes()).toEqual([hashSessionToken("raw-token")]);

    const session = await resolveSessionToken("raw-token", {
      client,
      now: new Date("2026-07-09T10:01:00.000Z"),
    });

    expect(session).toEqual({
      email: "user-1@example.com",
      role: "USER",
      sessionId: "session-1",
      userId: "user-1",
    });
  });

  it("revokes expired sessions during resolution", async () => {
    const client = createSessionClient();
    await createUserSession("user-1", {
      client,
      now: new Date("2026-07-01T10:00:00.000Z"),
      token: "expired-token",
    });

    await expect(
      resolveSessionToken("expired-token", {
        client,
        now: new Date("2026-07-09T10:00:00.000Z"),
      }),
    ).resolves.toBeNull();
    expect(client.storedTokenHashes()).toEqual([]);
  });

  it("does not resolve suspended or deleted users", async () => {
    const client = createSessionClient({ suspendedAt: new Date("2026-07-09T10:00:00.000Z") });
    await createUserSession("user-1", { client, token: "raw-token" });

    await expect(resolveSessionToken("raw-token", { client })).resolves.toBeNull();
  });

  it("revokes the requested token hash", async () => {
    const client = createSessionClient();
    await createUserSession("user-1", { client, token: "raw-token" });

    await revokeSessionToken("raw-token", { client });

    expect(client.storedTokenHashes()).toEqual([]);
  });
});

function createSessionClient(
  userOverrides: Partial<{
    deletedAt: Date | null;
    suspendedAt: Date | null;
  }> = {},
): SessionClient & { storedTokenHashes(): string[] } {
  const sessions = new Map<
    string,
    {
      expiresAt: Date;
      id: string;
      userId: string;
    }
  >();
  const deleteMany = vi.fn(
    async ({ where }: { where: { tokenHash?: string; expiresAt?: { lte: Date } } }) => {
      if (where.tokenHash) {
        sessions.delete(where.tokenHash);
      }

      if (where.expiresAt) {
        for (const [tokenHash, session] of sessions.entries()) {
          if (session.expiresAt <= where.expiresAt.lte) {
            sessions.delete(tokenHash);
          }
        }
      }
    },
  );

  return {
    session: {
      async create(args) {
        sessions.set(args.data.tokenHash, {
          expiresAt: args.data.expiresAt,
          id: "session-1",
          userId: args.data.userId,
        });
        return { id: "session-1" };
      },
      deleteMany,
      async findUnique(args) {
        const session = sessions.get(args.where.tokenHash);
        if (!session) return null;

        return {
          expiresAt: session.expiresAt,
          id: session.id,
          user: {
            deletedAt: userOverrides.deletedAt ?? null,
            email: `${session.userId}@example.com`,
            id: session.userId,
            role: "USER",
            suspendedAt: userOverrides.suspendedAt ?? null,
          },
        };
      },
    },
    storedTokenHashes() {
      return Array.from(sessions.keys());
    },
  };
}
