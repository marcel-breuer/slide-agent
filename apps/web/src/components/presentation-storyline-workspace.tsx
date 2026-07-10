"use client";

/* global HTMLFormElement */

import { useMemo, useState, type FormEvent, type ReactElement } from "react";
import { GitBranch, Loader2 } from "lucide-react";

import { useUiLocale } from "@/lib/ui-locale";

import { Button, ui } from "./ui";

type StorylineSummary = {
  id: string;
  name: string;
  method: string;
  rationale: string;
  createdAt: string;
  latestVersion: { outline: unknown; version: number } | null;
};

type StorylineApiResponse =
  { ok: true; data: StorylineSummary } | { ok: false; error: { code: string; message: string } };

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
  const { msg } = useUiLocale();
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
    <div className="grid gap-4 md:grid-cols-2">
      <section className={ui.card}>
        <h2 className={ui.sectionTitle}>{msg("createStoryline")}</h2>
        <form className="grid gap-3.5" onSubmit={(event) => void createStoryline(event)}>
          <label className={ui.field}>
            <span>Name</span>
            <input
              className={ui.input}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              disabled={archived}
            />
          </label>
          <label className={ui.field}>
            <span>Method</span>
            <input
              className={ui.input}
              value={method}
              onChange={(event) => setMethod(event.target.value)}
              required
              disabled={archived}
            />
          </label>
          <label className={ui.field}>
            <span>Rationale</span>
            <textarea
              className="min-h-24 resize-y rounded-lg border border-line bg-white px-3 py-2.5 text-sm font-medium normal-case text-ink"
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
              required
              disabled={archived}
            />
          </label>
          <label className={ui.field}>
            <span>Outline</span>
            <textarea
              className="min-h-24 resize-y rounded-lg border border-line bg-white px-3 py-2.5 text-sm font-medium normal-case text-ink"
              value={outline}
              onChange={(event) => setOutline(event.target.value)}
              required
              disabled={archived}
            />
          </label>

          {error ? <div className={ui.alert}>{error}</div> : null}

          <Button type="submit" variant="primary" disabled={archived || submitting}>
            {submitting ? (
              <Loader2 size={17} className="animate-spin" aria-hidden="true" />
            ) : (
              <GitBranch size={17} aria-hidden="true" />
            )}
            {msg("createStoryline")}
          </Button>
        </form>
      </section>

      <section className={ui.card}>
        <h2 className={ui.sectionTitle}>{msg("storyline")}</h2>
        {items.length === 0 ? (
          <p className={ui.muted}>No storylines have been created yet.</p>
        ) : (
          <ul className={ui.list}>
            {items.map((storyline) => (
              <li className="rounded-lg border border-line bg-canvas p-3" key={storyline.id}>
                <strong className="block text-ink">{storyline.name}</strong>
                <span className="block text-sm leading-6 text-muted">{storyline.method}</span>
                <p className="mt-2 text-sm leading-6 text-muted">{storyline.rationale}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
