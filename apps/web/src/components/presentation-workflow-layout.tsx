import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, FileDown, FileText, GitBranch, LayoutPanelTop, PenLine } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import type { PresentationWorkflow } from "@/lib/presentation-workflow";
import { useUiLocale } from "@/lib/ui-locale";

import { ButtonLink, cn, ui } from "./ui";

type Workflow = NonNullable<PresentationWorkflow>;

const workflowSteps = [
  { id: "overview", labelKey: "overview", suffix: "", icon: LayoutPanelTop },
  { id: "briefing", labelKey: "briefing", suffix: "/briefing", icon: FileText },
  { id: "storyline", labelKey: "storyline", suffix: "/storyline", icon: GitBranch },
  { id: "editor", labelKey: "editor", suffix: "/editor", icon: PenLine },
  { id: "export", labelKey: "actionExport", suffix: "/export", icon: FileDown },
] as const;

export function PresentationWorkflowLayout({
  activeStep,
  children,
  workflow,
}: {
  activeStep: string;
  children: ReactNode;
  workflow: Workflow;
}): ReactElement {
  const { msg } = useUiLocale();

  return (
    <section className={ui.workflowShell}>
      <div className={ui.pageHeader}>
        <div>
          <Link
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-extrabold text-muted no-underline hover:text-primary"
            href={`/app/projects/${encodeURIComponent(workflow.project.id)}` as Route}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            {workflow.project.name}
          </Link>
          <p className={ui.kicker}>{msg("presentation")}</p>
          <h1 className={ui.title}>{workflow.title}</h1>
          <p className="mt-2 text-sm font-bold text-muted">
            {workflow.status} · {workflow.slideCount} slides · {workflow.outputLanguage}
          </p>
        </div>
      </div>

      <nav
        className="mb-6 flex flex-wrap gap-2 border-b border-line pb-3"
        aria-label="Presentation workflow"
      >
        {workflowSteps.map((step) => {
          const Icon = step.icon;
          const href = `/app/presentations/${encodeURIComponent(workflow.id)}${step.suffix}`;
          return (
            <Link
              key={step.id}
              className={cn(
                "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-extrabold text-muted no-underline hover:bg-white hover:text-ink",
                activeStep === step.id && "bg-primary/10 text-primary",
              )}
              href={href as Route}
            >
              <Icon size={16} aria-hidden="true" />
              {msg(step.labelKey)}
            </Link>
          );
        })}
      </nav>

      {workflow.archivedAt ? (
        <div className={ui.alert}>This presentation is archived and cannot be edited.</div>
      ) : null}

      {children}
    </section>
  );
}

export function PresentationOverview({ workflow }: { workflow: Workflow }): ReactElement {
  const { msg } = useUiLocale();
  const briefingReady = Boolean(workflow.briefing);
  const storylineReady = workflow.storylines.length > 0;
  const exported = workflow.exports.length > 0;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className={ui.card}>
        <h2 className={ui.sectionTitle}>{msg("workflowStatus")}</h2>
        <dl className="grid gap-3 md:grid-cols-2">
          <Metric label="Briefing" value={briefingReady ? "Ready" : "Open"} />
          <Metric label="Storyline" value={storylineReady ? "Ready" : "Open"} />
          <Metric label="Exports" value={exported ? String(workflow.exports.length) : "None"} />
          <Metric label="Updated" value={formatDate(workflow.updatedAt)} />
        </dl>
      </section>

      <section className={ui.card}>
        <h2 className={ui.sectionTitle}>Slides</h2>
        {workflow.slideTitles.length === 0 ? (
          <p className={ui.muted}>No slides have been created yet.</p>
        ) : (
          <ol className="grid list-none gap-2.5 p-0">
            {workflow.slideTitles.slice(0, 8).map((slide) => (
              <li
                className="grid grid-cols-[28px_minmax(0,1fr)] items-center gap-2.5 text-sm font-bold text-ink"
                key={slide.id}
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-canvas text-xs text-muted">
                  {slide.order}
                </span>
                {slide.title}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className={ui.card}>
        <h2 className={ui.sectionTitle}>Next actions</h2>
        <div className="flex flex-wrap gap-2.5">
          <ButtonLink
            href={`/app/presentations/${encodeURIComponent(workflow.id)}/briefing` as Route}
          >
            {msg("briefing")}
          </ButtonLink>
          <ButtonLink
            href={`/app/presentations/${encodeURIComponent(workflow.id)}/storyline` as Route}
          >
            {msg("storyline")}
          </ButtonLink>
          <ButtonLink
            variant="primary"
            href={`/app/presentations/${encodeURIComponent(workflow.id)}/editor` as Route}
          >
            {msg("editor")}
          </ButtonLink>
          <ButtonLink
            href={`/app/presentations/${encodeURIComponent(workflow.id)}/export` as Route}
          >
            {msg("actionExport")}
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-lg border border-line bg-canvas p-3">
      <dt className="text-xs font-extrabold uppercase text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-extrabold text-ink">{value}</dd>
    </div>
  );
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
