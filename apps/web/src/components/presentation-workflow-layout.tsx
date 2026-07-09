import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, FileDown, FileText, GitBranch, LayoutPanelTop, PenLine } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import type { PresentationWorkflow } from "@/lib/presentation-workflow";

type Workflow = NonNullable<PresentationWorkflow>;

const workflowSteps = [
  { id: "overview", label: "Overview", suffix: "", icon: LayoutPanelTop },
  { id: "briefing", label: "Briefing", suffix: "/briefing", icon: FileText },
  { id: "storyline", label: "Storyline", suffix: "/storyline", icon: GitBranch },
  { id: "editor", label: "Editor", suffix: "/editor", icon: PenLine },
  { id: "export", label: "Export", suffix: "/export", icon: FileDown },
];

export function PresentationWorkflowLayout({
  activeStep,
  children,
  workflow,
}: {
  activeStep: string;
  children: ReactNode;
  workflow: Workflow;
}): ReactElement {
  return (
    <section className="workflow-shell">
      <div className="workflow-header">
        <div>
          <Link
            className="workflow-back-link"
            href={`/app/projects/${encodeURIComponent(workflow.project.id)}` as Route}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            {workflow.project.name}
          </Link>
          <p className="workspace-kicker">Presentation</p>
          <h1>{workflow.title}</h1>
          <p>
            {workflow.status} · {workflow.slideCount} slides · {workflow.outputLanguage}
          </p>
        </div>
      </div>

      <nav className="workflow-tabs" aria-label="Presentation workflow">
        {workflowSteps.map((step) => {
          const Icon = step.icon;
          const href = `/app/presentations/${encodeURIComponent(workflow.id)}${step.suffix}`;
          return (
            <Link
              key={step.id}
              className={activeStep === step.id ? "workflow-tab active" : "workflow-tab"}
              href={href as Route}
            >
              <Icon size={16} aria-hidden="true" />
              {step.label}
            </Link>
          );
        })}
      </nav>

      {workflow.archivedAt ? (
        <div className="workspace-alert">This presentation is archived and cannot be edited.</div>
      ) : null}

      {children}
    </section>
  );
}

export function PresentationOverview({ workflow }: { workflow: Workflow }): ReactElement {
  const briefingReady = Boolean(workflow.briefing);
  const storylineReady = workflow.storylines.length > 0;
  const exported = workflow.exports.length > 0;

  return (
    <div className="workflow-grid">
      <section className="workflow-card">
        <h2>Workflow status</h2>
        <dl className="workflow-metrics">
          <Metric label="Briefing" value={briefingReady ? "Ready" : "Open"} />
          <Metric label="Storyline" value={storylineReady ? "Ready" : "Open"} />
          <Metric label="Exports" value={exported ? String(workflow.exports.length) : "None"} />
          <Metric label="Updated" value={formatDate(workflow.updatedAt)} />
        </dl>
      </section>

      <section className="workflow-card">
        <h2>Slides</h2>
        {workflow.slideTitles.length === 0 ? (
          <p className="workflow-muted">No slides have been created yet.</p>
        ) : (
          <ol className="workflow-list">
            {workflow.slideTitles.slice(0, 8).map((slide) => (
              <li key={slide.id}>
                <span>{slide.order}</span>
                {slide.title}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="workflow-card">
        <h2>Next actions</h2>
        <div className="workflow-actions">
          <Link
            className="workspace-button"
            href={`/app/presentations/${encodeURIComponent(workflow.id)}/briefing` as Route}
          >
            Open briefing
          </Link>
          <Link
            className="workspace-button"
            href={`/app/presentations/${encodeURIComponent(workflow.id)}/storyline` as Route}
          >
            Open storyline
          </Link>
          <Link
            className="workspace-button primary"
            href={`/app/presentations/${encodeURIComponent(workflow.id)}/editor` as Route}
          >
            Open editor
          </Link>
          <Link
            className="workspace-button"
            href={`/app/presentations/${encodeURIComponent(workflow.id)}/export` as Route}
          >
            Export
          </Link>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
