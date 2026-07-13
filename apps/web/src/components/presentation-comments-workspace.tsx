"use client";

import { useEffect, useState, type FormEvent, type ReactElement } from "react";

import { Button, ui } from "./ui";

type SlideOption = { id: string; order: number; title: string };
type Comment = {
  author: { displayName: string; id: string };
  authorId: string;
  body: string;
  createdAt: string;
  deletedAt: string | null;
  elementId: string | null;
  events: Array<{ action: string; actor: { displayName: string; id: string }; createdAt: string }>;
  id: string;
  replies: Array<{
    author: { displayName: string; id: string };
    authorId: string;
    body: string;
    createdAt: string;
    id: string;
  }>;
  resolvedAt: string | null;
  slideId: string;
  status: "OPEN" | "RESOLVED";
};

type CommentsResponse = {
  comments: Comment[];
  unresolvedCount: number;
};

export function PresentationCommentsWorkspace({
  presentationId,
  slides,
}: {
  presentationId: string;
  slides: SlideOption[];
}): ReactElement {
  const [comments, setComments] = useState<Comment[]>([]);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [selectedSlideId, setSelectedSlideId] = useState(slides[0]?.id ?? "");
  const [elementId, setElementId] = useState("");
  const [body, setBody] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadComments();
  }, [presentationId]);

  async function loadComments(): Promise<void> {
    try {
      const response = await fetch(
        `/api/presentations/${encodeURIComponent(presentationId)}/comments`,
      );
      const payload = (await response.json()) as {
        ok: boolean;
        data?: CommentsResponse;
        error?: { message: string };
      };
      if (!response.ok || !payload.ok || !payload.data) {
        setError(payload.error?.message ?? "Comments could not be loaded.");
        return;
      }
      setComments(payload.data.comments);
      setUnresolvedCount(payload.data.unresolvedCount);
    } catch {
      setError("Comments could not be loaded.");
    }
  }

  async function createComment(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    const response = await fetch(
      `/api/presentations/${encodeURIComponent(presentationId)}/comments`,
      {
        body: JSON.stringify({ body, elementId: elementId || null, slideId: selectedSlideId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    if (!response.ok) {
      const payload = (await response.json()) as { error?: { message: string } };
      setError(payload.error?.message ?? "Comment could not be created.");
      return;
    }
    setBody("");
    setElementId("");
    await loadComments();
  }

  async function updateComment(commentId: string, action: "resolve" | "reopen"): Promise<void> {
    const response = await fetch(
      `/api/presentations/${encodeURIComponent(presentationId)}/comments/${encodeURIComponent(commentId)}`,
      {
        body: JSON.stringify({ action }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      },
    );
    if (!response.ok) setError("Comment could not be updated.");
    await loadComments();
  }

  async function replyToComment(commentId: string): Promise<void> {
    const reply = replyDrafts[commentId]?.trim();
    if (!reply) return;
    const response = await fetch(
      `/api/presentations/${encodeURIComponent(presentationId)}/comments/${encodeURIComponent(commentId)}/replies`,
      {
        body: JSON.stringify({ body: reply }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    if (!response.ok) setError("Reply could not be added.");
    setReplyDrafts((current) => ({ ...current, [commentId]: "" }));
    await loadComments();
  }

  return (
    <section className={ui.card} aria-labelledby="presentation-comments-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="presentation-comments-title" className={ui.sectionTitle}>
            Review comments
          </h2>
          <p className={ui.muted}>
            {unresolvedCount} unresolved thread{unresolvedCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      {error ? <p className={ui.alert}>{error}</p> : null}
      <form className="mt-4 grid gap-3" onSubmit={(event) => void createComment(event)}>
        <label className="grid gap-1 text-sm font-extrabold text-ink">
          Slide
          <select
            aria-label="Comment slide"
            className={ui.input}
            onChange={(event) => setSelectedSlideId(event.target.value)}
            value={selectedSlideId}
          >
            {slides.map((slide) => (
              <option key={slide.id} value={slide.id}>
                {slide.order}. {slide.title}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-extrabold text-ink">
          Element ID (optional)
          <input
            aria-label="Comment element ID"
            className={ui.input}
            onChange={(event) => setElementId(event.target.value)}
            placeholder="e.g. title"
            value={elementId}
          />
        </label>
        <label className="grid gap-1 text-sm font-extrabold text-ink">
          Comment
          <textarea
            aria-label="Comment"
            className={`${ui.input} min-h-24 py-2`}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Leave review feedback"
            value={body}
          />
        </label>
        <Button type="submit" variant="primary" disabled={!selectedSlideId || !body.trim()}>
          Add comment
        </Button>
      </form>
      <div className="mt-5 grid gap-3">
        {comments.length === 0 ? <p className={ui.muted}>No comments yet.</p> : null}
        {comments.map((comment) => (
          <article className="rounded-xl border border-line bg-canvas p-3" key={comment.id}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-extrabold text-muted">
              <span>
                {comment.author.displayName} · slide{" "}
                {slides.find((slide) => slide.id === comment.slideId)?.order ?? "?"}
                {comment.elementId ? ` · ${comment.elementId}` : ""}
              </span>
              <span>{comment.status === "OPEN" ? "Open" : "Resolved"}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm font-bold text-ink">{comment.body}</p>
            {comment.replies.map((reply) => (
              <div className="mt-2 border-l-2 border-line pl-3 text-sm text-muted" key={reply.id}>
                <span className="font-extrabold text-ink">{reply.author.displayName}:</span>{" "}
                {reply.body}
              </div>
            ))}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  void updateComment(comment.id, comment.status === "OPEN" ? "resolve" : "reopen")
                }
              >
                {comment.status === "OPEN" ? "Resolve" : "Reopen"}
              </Button>
              <input
                aria-label={`Reply to ${comment.author.displayName}`}
                className={`${ui.input} min-w-48 flex-1 py-1.5`}
                onChange={(event) =>
                  setReplyDrafts((current) => ({ ...current, [comment.id]: event.target.value }))
                }
                placeholder="Reply"
                value={replyDrafts[comment.id] ?? ""}
              />
              <Button onClick={() => void replyToComment(comment.id)}>Reply</Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
