import type { Prisma } from "@slide-agent/database";

export const MAX_COMMENT_LENGTH = 2_000;

export function sanitizeCommentBody(value: string): string {
  return value
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return !(
        code <= 8 ||
        code === 11 ||
        code === 12 ||
        (code >= 14 && code <= 31) ||
        code === 127
      );
    })
    .join("")
    .trim();
}

export function asJsonRecord(value: Prisma.JsonValue): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function hasElement(document: Prisma.JsonValue, elementId: string): boolean {
  const record = asJsonRecord(document);
  const elements = record?.elements;
  return (
    Array.isArray(elements) &&
    elements.some(
      (element) =>
        element !== null &&
        typeof element === "object" &&
        !Array.isArray(element) &&
        (element as Record<string, unknown>).id === elementId,
    )
  );
}

export function serializeComment(comment: {
  author: { displayName: string | null; email: string; id: string };
  authorId: string;
  body: string;
  createdAt: Date;
  deletedAt: Date | null;
  elementId: string | null;
  events: Array<{
    action: string;
    actor: { displayName: string | null; email: string; id: string };
    createdAt: Date;
    metadata: Prisma.JsonValue;
  }>;
  id: string;
  mentions: Array<{ mentionedUserId: string }>;
  replies: Array<{
    author: { displayName: string | null; email: string; id: string };
    authorId: string;
    body: string;
    createdAt: Date;
    id: string;
  }>;
  resolvedAt: Date | null;
  status: string;
  slideId: string;
}): Record<string, unknown> {
  return {
    author: displayName(comment.author),
    authorId: comment.authorId,
    body: comment.deletedAt ? "Comment deleted" : comment.body,
    createdAt: comment.createdAt.toISOString(),
    deletedAt: comment.deletedAt?.toISOString() ?? null,
    elementId: comment.elementId,
    events: comment.events.map((event) => ({
      action: event.action,
      actor: displayName(event.actor),
      createdAt: event.createdAt.toISOString(),
      metadata: event.metadata,
    })),
    id: comment.id,
    mentions: comment.mentions.map((mention) => mention.mentionedUserId),
    replies: comment.replies.map((reply) => ({
      author: displayName(reply.author),
      authorId: reply.authorId,
      body: reply.body,
      createdAt: reply.createdAt.toISOString(),
      id: reply.id,
    })),
    resolvedAt: comment.resolvedAt?.toISOString() ?? null,
    slideId: comment.slideId,
    status: comment.status,
  };
}

function displayName(user: { displayName: string | null; email: string; id: string }) {
  return { displayName: user.displayName ?? user.email, id: user.id };
}
