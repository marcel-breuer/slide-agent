"use client";

/* global HTMLFormElement */

import { useState, type FormEvent, type ReactElement } from "react";
import { CheckCircle2, Loader2, Plus, Save, Trash2 } from "lucide-react";

import { useUiLocale } from "@/lib/ui-locale";

import { Button, ui } from "./ui";

type BriefingAnswers = {
  approved?: boolean;
  audience?: string;
  context?: string;
  followUps?: Array<{ answer: string; question: string }>;
  goal?: string;
  references?: Array<{ label: string; note?: string; type: "attachment" | "link" | "note" }>;
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
  const { msg } = useUiLocale();
  const initialAnswers = asBriefingAnswers(briefing?.answers);
  const [audience, setAudience] = useState(initialAnswers.audience ?? "");
  const [approved, setApproved] = useState(initialAnswers.approved ?? false);
  const [context, setContext] = useState(initialAnswers.context ?? "");
  const [error, setError] = useState<string | null>(null);
  const [followUps, setFollowUps] = useState(
    initialAnswers.followUps?.length
      ? initialAnswers.followUps
      : [
          {
            question: "Which decision should the audience make after this deck?",
            answer: "",
          },
          {
            question: "Which objections or risks should the storyline address?",
            answer: "",
          },
        ],
  );
  const [goal, setGoal] = useState(initialAnswers.goal ?? "");
  const [references, setReferences] = useState(initialAnswers.references ?? []);
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
            approved,
            audience,
            context,
            followUps,
            goal,
            references,
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
      const answers = asBriefingAnswers(payload.data.answers);
      setApproved(answers.approved ?? false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Briefing could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={ui.card}>
      <h2 className={ui.sectionTitle}>{msg("briefing")}</h2>
      <form className="grid gap-3.5" onSubmit={(event) => void saveBriefing(event)}>
        <label className={ui.field}>
          <span>Goal</span>
          <textarea
            className="min-h-24 resize-y rounded-lg border border-line bg-white px-3 py-2.5 text-sm font-medium normal-case text-ink"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            required
            disabled={archived}
          />
        </label>
        <label className={ui.field}>
          <span>Audience</span>
          <textarea
            className="min-h-24 resize-y rounded-lg border border-line bg-white px-3 py-2.5 text-sm font-medium normal-case text-ink"
            value={audience}
            onChange={(event) => setAudience(event.target.value)}
            required
            disabled={archived}
          />
        </label>
        <label className={ui.field}>
          <span>Context</span>
          <textarea
            className="min-h-24 resize-y rounded-lg border border-line bg-white px-3 py-2.5 text-sm font-medium normal-case text-ink"
            value={context}
            onChange={(event) => setContext(event.target.value)}
            disabled={archived}
          />
        </label>
        <label className={ui.field}>
          <span>Requirements</span>
          <textarea
            className="min-h-24 resize-y rounded-lg border border-line bg-white px-3 py-2.5 text-sm font-medium normal-case text-ink"
            value={requirements}
            onChange={(event) => setRequirements(event.target.value)}
            disabled={archived}
          />
        </label>
        <label className={ui.field}>
          <span>Success criteria</span>
          <textarea
            className="min-h-24 resize-y rounded-lg border border-line bg-white px-3 py-2.5 text-sm font-medium normal-case text-ink"
            value={successCriteria}
            onChange={(event) => setSuccessCriteria(event.target.value)}
            disabled={archived}
          />
        </label>

        <section className="grid gap-3 rounded-lg border border-line bg-canvas p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-ink">Adaptive follow-up questions</h3>
              <p className="mt-1 text-xs font-bold leading-5 text-muted">
                Capture the missing context the generator should consider before proposing a
                storyline.
              </p>
            </div>
            <Button
              type="button"
              disabled={archived}
              onClick={() =>
                setFollowUps((current) => [
                  ...current,
                  { question: "What else should the model clarify?", answer: "" },
                ])
              }
            >
              <Plus size={16} aria-hidden="true" />
              Add question
            </Button>
          </div>
          {followUps.map((followUp, index) => (
            <div className="grid gap-2 rounded-lg border border-line bg-white p-3" key={index}>
              <label className={ui.field}>
                <span>Question</span>
                <input
                  className={ui.input}
                  value={followUp.question}
                  onChange={(event) =>
                    setFollowUps((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, question: event.target.value } : item,
                      ),
                    )
                  }
                  disabled={archived}
                />
              </label>
              <label className={ui.field}>
                <span>Answer</span>
                <textarea
                  className="min-h-20 resize-y rounded-lg border border-line bg-white px-3 py-2.5 text-sm font-medium normal-case text-ink"
                  value={followUp.answer}
                  onChange={(event) =>
                    setFollowUps((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, answer: event.target.value } : item,
                      ),
                    )
                  }
                  disabled={archived}
                />
              </label>
              <button
                type="button"
                className={ui.iconButton}
                title="Remove follow-up"
                disabled={archived || followUps.length <= 1}
                onClick={() =>
                  setFollowUps((current) =>
                    current.filter((_item, itemIndex) => itemIndex !== index),
                  )
                }
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
        </section>

        <section className="grid gap-3 rounded-lg border border-line bg-canvas p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-ink">References and attachments</h3>
              <p className="mt-1 text-xs font-bold leading-5 text-muted">
                Track source notes, links, or attachment labels for the generation context.
              </p>
            </div>
            <Button
              type="button"
              disabled={archived}
              onClick={() =>
                setReferences((current) => [
                  ...current,
                  { label: "Reference", note: "", type: "note" },
                ])
              }
            >
              <Plus size={16} aria-hidden="true" />
              Add reference
            </Button>
          </div>
          {references.length === 0 ? (
            <p className={ui.empty}>No references added yet.</p>
          ) : (
            references.map((reference, index) => (
              <div
                className="grid gap-2 rounded-lg border border-line bg-white p-3 md:grid-cols-[1fr_140px_auto]"
                key={index}
              >
                <label className={ui.field}>
                  <span>Label</span>
                  <input
                    className={ui.input}
                    value={reference.label}
                    onChange={(event) =>
                      setReferences((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, label: event.target.value } : item,
                        ),
                      )
                    }
                    disabled={archived}
                  />
                </label>
                <label className={ui.field}>
                  <span>Type</span>
                  <select
                    className={ui.input}
                    value={reference.type}
                    onChange={(event) =>
                      setReferences((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                type: event.target.value as "attachment" | "link" | "note",
                              }
                            : item,
                        ),
                      )
                    }
                    disabled={archived}
                  >
                    <option value="note">Note</option>
                    <option value="link">Link</option>
                    <option value="attachment">Attachment</option>
                  </select>
                </label>
                <button
                  type="button"
                  className={ui.iconButton}
                  title="Remove reference"
                  disabled={archived}
                  onClick={() =>
                    setReferences((current) =>
                      current.filter((_item, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
                <label className={`${ui.field} md:col-span-3`}>
                  <span>Note</span>
                  <input
                    className={ui.input}
                    value={reference.note ?? ""}
                    onChange={(event) =>
                      setReferences((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, note: event.target.value } : item,
                        ),
                      )
                    }
                    disabled={archived}
                  />
                </label>
              </div>
            ))
          )}
        </section>

        <label className="flex items-start gap-3 rounded-lg border border-line bg-white p-3 text-sm font-bold text-ink">
          <input
            className="mt-1"
            type="checkbox"
            checked={approved}
            onChange={(event) => setApproved(event.target.checked)}
            disabled={archived}
          />
          <span>
            <span className="flex items-center gap-2 font-extrabold">
              <CheckCircle2 size={16} aria-hidden="true" />
              Approve briefing for storyline generation
            </span>
            <span className="mt-1 block text-xs leading-5 text-muted">
              Approval confirms that the briefing is ready to be used as model context.
            </span>
          </span>
        </label>

        {error ? <div className={ui.alert}>{error}</div> : null}
        {savedAt ? <p className={ui.muted}>Saved {formatSavedAt(savedAt)}</p> : null}

        <Button type="submit" variant="primary" disabled={archived || submitting}>
          {submitting ? (
            <Loader2 size={17} className="animate-spin" aria-hidden="true" />
          ) : (
            <Save size={17} aria-hidden="true" />
          )}
          {msg("saveBriefing")}
        </Button>
      </form>
    </section>
  );
}

function formatSavedAt(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function asBriefingAnswers(value: unknown): BriefingAnswers {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return {
    audience: typeof record.audience === "string" ? record.audience : "",
    approved: record.approved === true,
    context: typeof record.context === "string" ? record.context : "",
    followUps: Array.isArray(record.followUps)
      ? record.followUps
          .map((item) =>
            item && typeof item === "object" ? (item as Record<string, unknown>) : null,
          )
          .filter((item): item is Record<string, unknown> => Boolean(item))
          .map((item) => ({
            answer: typeof item.answer === "string" ? item.answer : "",
            question: typeof item.question === "string" ? item.question : "",
          }))
          .filter((item) => item.question)
      : [],
    goal: typeof record.goal === "string" ? record.goal : "",
    references: Array.isArray(record.references)
      ? record.references
          .map((item) =>
            item && typeof item === "object" ? (item as Record<string, unknown>) : null,
          )
          .filter((item): item is Record<string, unknown> => Boolean(item))
          .map((item) => ({
            label: typeof item.label === "string" ? item.label : "",
            note: typeof item.note === "string" ? item.note : "",
            type: (item.type === "attachment" || item.type === "link" || item.type === "note"
              ? item.type
              : "note") as "attachment" | "link" | "note",
          }))
          .filter((item) => item.label)
      : [],
    requirements: typeof record.requirements === "string" ? record.requirements : "",
    successCriteria: typeof record.successCriteria === "string" ? record.successCriteria : "",
  };
}
