"use client";

/* global HTMLFormElement */

import { useMemo, useState, type FormEvent, type ReactElement } from "react";
import { GitBranch, Loader2 } from "lucide-react";

type StorylineSummary = {
  id: string;
  name: string;
  method: string;
  rationale: string;
  createdAt: string;
  latestVersion: { outline: unknown; version: number } | null;
};

type StorylineApiResponse =
  | { ok: true; data: StorylineSummary }
  | { ok: false; error: { code: string; message: string } };

export function PresentationStorylineWorkspace({
  archived,
  presentationId,
  slideTitles,
  storylines,
}: {
  archived: boolean;
  presentationId: string;
  slideTitles: Array<{ order: number; title: string }>;
  storylines: StorylineSummary[];
}): ReactElement {
  const defaultOutline = useMemo(
    () => slideTitles.map((slide) => slide.title).join("\n"),
    [slideTitles],
  );
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState("Manual outline");
  const [name, setName] = useState("Primary storyline");
  const [outline, setOutline] = useState(defaultOutline || "Opening\nRecommendation\nNext steps");
  const [rationale, setRationale] = useState(
    "Uses the current slide order as the first storyline.",
  );
  const [items, setItems] = useState(storylines);
  const [submitting, setSubmitting] = useState(false);

  async function createStoryline(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(
        `/api/presentations/${encodeURIComponent(presentationId)}/storyline`,
        {
          body: JSON.stringify({
            method,
            name,
            outline: outline
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
            rationale,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const payload = (await response.json()) as StorylineApiResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Storyline could not be created." : payload.error.message);
        return;
      }
      setItems((current) => [payload.data, ...current]);
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Storyline could not be created.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="workflow-grid">
      <section className="workflow-card">
        <h2>Create storyline</h2>
        <form className="workflow-form" onSubmit={(event) => void createStoryline(event)}>
          <label>
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              disabled={archived}
            />
          </label>
          <label>
            Method
            <input
              value={method}
              onChange={(event) => setMethod(event.target.value)}
              required
              disabled={archived}
            />
          </label>
          <label>
            Rationale
            <textarea
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
              required
              disabled={archived}
            />
          </label>
          <label>
            Outline
            <textarea
              value={outline}
              onChange={(event) => setOutline(event.target.value)}
              required
              disabled={archived}
            />
          </label>

          {error ? <div className="workspace-alert">{error}</div> : null}

          <button
            type="submit"
            className="workspace-button primary"
            disabled={archived || submitting}
          >
            {submitting ? (
              <Loader2 size={17} className="import-spin" aria-hidden="true" />
            ) : (
              <GitBranch size={17} aria-hidden="true" />
            )}
            Create storyline
          </button>
        </form>
      </section>

      <section className="workflow-card">
        <h2>Storylines</h2>
        {items.length === 0 ? (
          <p className="workflow-muted">No storylines have been created yet.</p>
        ) : (
          <ul className="workflow-stack">
            {items.map((storyline) => (
              <li key={storyline.id}>
                <strong>{storyline.name}</strong>
                <span>{storyline.method}</span>
                <p>{storyline.rationale}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
