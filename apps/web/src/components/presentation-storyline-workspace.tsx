"use client";

/* global HTMLFormElement */

import { useMemo, useState, type FormEvent, type ReactElement } from "react";
import { CheckCircle2, GitBranch, Loader2, Sparkles } from "lucide-react";

import { useUiLocale } from "@/lib/ui-locale";

import { Button, ui } from "./ui";

type StorylineSummary = {
  id: string;
  name: string;
  method: string;
  rationale: string;
  createdAt: string;
  latestVersion: {
    approvedAt: string | null;
    generated?: boolean;
    id: string;
    outline: unknown;
    proposalSummary?: string | null;
    scopeEstimate?: {
      confidence: "high" | "low" | "medium";
      estimatedMinutes: number | null;
      slideCount: number | null;
    };
    version: number;
  } | null;
};

type StorylineApiResponse =
  { ok: true; data: StorylineSummary } | { ok: false; error: { code: string; message: string } };
type StorylineApprovalResponse =
  | { ok: true; data: { approvedAt: string; storylineVersionId: string } }
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
  const { msg } = useUiLocale();
  const defaultOutline = useMemo(
    () => slideTitles.map((slide) => slide.title).join("\n"),
    [slideTitles],
  );
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState("Manual outline");
  const [name, setName] = useState("Primary storyline");
  const [outline, setOutline] = useState(defaultOutline || "Opening\nRecommendation\nNext steps");
  const [proposalSummary, setProposalSummary] = useState(
    "A concise proposal based on current slide order and briefing readiness.",
  );
  const [rationale, setRationale] = useState(
    "Uses the current slide order as the first storyline.",
  );
  const [items, setItems] = useState(storylines);
  const [submitting, setSubmitting] = useState(false);
  const [updatingApproval, setUpdatingApproval] = useState<string | null>(null);

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
            proposalSummary,
            outline: outline
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
            rationale,
            scopeEstimate: estimateScope(outline),
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

  async function generateProposal(): Promise<void> {
    const baseTitles = slideTitles.length
      ? slideTitles.map((slide) => slide.title)
      : ["Opening", "Audience problem", "Recommendation", "Implementation plan", "Next steps"];
    const generatedOutline = baseTitles.slice(0, 8);
    if (!generatedOutline.some((title) => title.toLowerCase().includes("recommendation"))) {
      generatedOutline.splice(Math.min(2, generatedOutline.length), 0, "Recommendation");
    }

    setName("Generated review proposal");
    setMethod("Generated proposal");
    setRationale(
      "Synthesizes the current slide structure into a reviewable proposal before generation.",
    );
    setProposalSummary(
      "Generated proposal with explicit scope estimate and approval gate before handoff.",
    );
    setOutline(generatedOutline.join("\n"));
  }

  async function approveStoryline(storyline: StorylineSummary): Promise<void> {
    const versionId = storyline.latestVersion?.id;
    if (!versionId) return;

    setError(null);
    setUpdatingApproval(versionId);

    try {
      const response = await fetch(
        `/api/presentations/${encodeURIComponent(presentationId)}/storyline`,
        {
          body: JSON.stringify({ approved: true, storylineVersionId: versionId }),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        },
      );
      const payload = (await response.json()) as StorylineApprovalResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Storyline could not be approved." : payload.error.message);
        return;
      }
      setItems((current) =>
        current.map((item) =>
          item.latestVersion?.id === versionId
            ? {
                ...item,
                latestVersion: {
                  ...item.latestVersion,
                  approvedAt: payload.data.approvedAt,
                },
              }
            : item,
        ),
      );
    } catch (approvalError) {
      setError(
        approvalError instanceof Error ? approvalError.message : "Storyline could not be approved.",
      );
    } finally {
      setUpdatingApproval(null);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className={ui.card}>
        <div className={ui.cardHeader}>
          <div>
            <h2 className={ui.sectionTitle}>{msg("createStoryline")}</h2>
            <p className={ui.muted}>
              Create or generate a review proposal with scope estimate before approving it.
            </p>
          </div>
          <Button type="button" disabled={archived} onClick={() => void generateProposal()}>
            <Sparkles size={17} aria-hidden="true" />
            Generate proposal
          </Button>
        </div>
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
            <span>Proposal summary</span>
            <textarea
              className="min-h-20 resize-y rounded-lg border border-line bg-white px-3 py-2.5 text-sm font-medium normal-case text-ink"
              value={proposalSummary}
              onChange={(event) => setProposalSummary(event.target.value)}
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

          <div className="grid gap-2 rounded-lg border border-line bg-canvas p-3 md:grid-cols-3">
            <Metric label="Estimated slides" value={String(estimateScope(outline).slideCount)} />
            <Metric label="Review time" value={`${estimateScope(outline).estimatedMinutes} min`} />
            <Metric label="Confidence" value={estimateScope(outline).confidence} />
          </div>

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
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong className="block text-ink">{storyline.name}</strong>
                    <span className="block text-sm leading-6 text-muted">{storyline.method}</span>
                  </div>
                  {storyline.latestVersion?.approvedAt ? (
                    <span className={`${ui.badge} ${ui.badgeReady}`}>
                      <CheckCircle2 size={14} aria-hidden="true" />
                      Approved
                    </span>
                  ) : (
                    <Button
                      type="button"
                      disabled={archived || updatingApproval === storyline.latestVersion?.id}
                      onClick={() => void approveStoryline(storyline)}
                    >
                      {updatingApproval === storyline.latestVersion?.id ? (
                        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <CheckCircle2 size={16} aria-hidden="true" />
                      )}
                      Approve
                    </Button>
                  )}
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">{storyline.rationale}</p>
                {storyline.latestVersion?.proposalSummary ? (
                  <p className="mt-2 rounded-lg border border-line bg-white p-3 text-sm font-bold leading-6 text-ink">
                    {storyline.latestVersion.proposalSummary}
                  </p>
                ) : null}
                {storyline.latestVersion?.scopeEstimate ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={ui.badge}>
                      {storyline.latestVersion.scopeEstimate.slideCount ?? "?"} slides
                    </span>
                    <span className={ui.badge}>
                      {storyline.latestVersion.scopeEstimate.estimatedMinutes ?? "?"} min
                    </span>
                    <span className={ui.badge}>
                      {storyline.latestVersion.scopeEstimate.confidence} confidence
                    </span>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function estimateScope(outline: string) {
  const slideCount = Math.max(
    1,
    outline
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean).length,
  );

  return {
    confidence:
      slideCount > 10 ? ("low" as const) : slideCount > 6 ? ("medium" as const) : ("high" as const),
    estimatedMinutes: Math.max(5, slideCount * 3),
    slideCount,
  };
}

function Metric({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div>
      <p className="text-xs font-extrabold uppercase text-muted">{label}</p>
      <p className="mt-1 text-sm font-extrabold capitalize text-ink">{value}</p>
    </div>
  );
}
