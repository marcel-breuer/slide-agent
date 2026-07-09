"use client";

/* global HTMLFormElement */

import { useState, type FormEvent, type ReactElement } from "react";
import { Loader2, Save } from "lucide-react";

type BriefingAnswers = {
  audience?: string;
  context?: string;
  goal?: string;
  requirements?: string;
  successCriteria?: string;
};

type BriefingApiResponse =
  | { ok: true; data: { answers: BriefingAnswers; updatedAt: string } | null }
  | { ok: false; error: { code: string; message: string } };

export function PresentationBriefingWorkspace({
  archived,
  briefing,
  presentationId,
}: {
  archived: boolean;
  briefing: { answers: unknown; updatedAt: string } | null;
  presentationId: string;
}): ReactElement {
  const initialAnswers = asBriefingAnswers(briefing?.answers);
  const [audience, setAudience] = useState(initialAnswers.audience ?? "");
  const [context, setContext] = useState(initialAnswers.context ?? "");
  const [error, setError] = useState<string | null>(null);
  const [goal, setGoal] = useState(initialAnswers.goal ?? "");
  const [requirements, setRequirements] = useState(initialAnswers.requirements ?? "");
  const [savedAt, setSavedAt] = useState(briefing?.updatedAt ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [successCriteria, setSuccessCriteria] = useState(initialAnswers.successCriteria ?? "");

  async function saveBriefing(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(
        `/api/presentations/${encodeURIComponent(presentationId)}/briefing`,
        {
          body: JSON.stringify({
            audience,
            context,
            goal,
            requirements,
            successCriteria,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const payload = (await response.json()) as BriefingApiResponse;
      if (!response.ok || !payload.ok || !payload.data) {
        setError(payload.ok ? "Briefing could not be saved." : payload.error.message);
        return;
      }
      setSavedAt(payload.data.updatedAt);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Briefing could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="workflow-card">
      <h2>Briefing</h2>
      <form className="workflow-form" onSubmit={(event) => void saveBriefing(event)}>
        <label>
          Goal
          <textarea
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            required
            disabled={archived}
          />
        </label>
        <label>
          Audience
          <textarea
            value={audience}
            onChange={(event) => setAudience(event.target.value)}
            required
            disabled={archived}
          />
        </label>
        <label>
          Context
          <textarea
            value={context}
            onChange={(event) => setContext(event.target.value)}
            disabled={archived}
          />
        </label>
        <label>
          Requirements
          <textarea
            value={requirements}
            onChange={(event) => setRequirements(event.target.value)}
            disabled={archived}
          />
        </label>
        <label>
          Success criteria
          <textarea
            value={successCriteria}
            onChange={(event) => setSuccessCriteria(event.target.value)}
            disabled={archived}
          />
        </label>

        {error ? <div className="workspace-alert">{error}</div> : null}
        {savedAt ? (
          <p className="workflow-muted">Saved {new Date(savedAt).toLocaleString()}</p>
        ) : null}

        <button
          type="submit"
          className="workspace-button primary"
          disabled={archived || submitting}
        >
          {submitting ? (
            <Loader2 size={17} className="import-spin" aria-hidden="true" />
          ) : (
            <Save size={17} aria-hidden="true" />
          )}
          Save briefing
        </button>
      </form>
    </section>
  );
}

function asBriefingAnswers(value: unknown): BriefingAnswers {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return {
    audience: typeof record.audience === "string" ? record.audience : "",
    context: typeof record.context === "string" ? record.context : "",
    goal: typeof record.goal === "string" ? record.goal : "",
    requirements: typeof record.requirements === "string" ? record.requirements : "",
    successCriteria: typeof record.successCriteria === "string" ? record.successCriteria : "",
  };
}
