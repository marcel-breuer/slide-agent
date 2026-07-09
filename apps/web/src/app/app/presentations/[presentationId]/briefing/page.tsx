import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { PresentationBriefingWorkspace } from "@/components/presentation-briefing-workspace";
import { PresentationWorkflowLayout } from "@/components/presentation-workflow-layout";
import { getPresentationWorkflow } from "@/lib/presentation-workflow";
import { getAuthenticatedUserId } from "@/lib/server-session";

type BriefingPageProps = {
  params: Promise<{
    presentationId: string;
  }>;
};

export default async function BriefingPage({ params }: BriefingPageProps) {
  const { presentationId } = await params;
  const userId = await getAuthenticatedUserId();
  if (!userId)
    redirect(`/login?next=/app/presentations/${encodeURIComponent(presentationId)}/briefing`);

  const workflow = await getPresentationWorkflow(userId, presentationId);
  if (!workflow) notFound();

  return (
    <AppShell>
      <PresentationWorkflowLayout activeStep="briefing" workflow={workflow}>
        <PresentationBriefingWorkspace
          archived={Boolean(workflow.archivedAt)}
          briefing={workflow.briefing}
          presentationId={workflow.id}
        />
      </PresentationWorkflowLayout>
    </AppShell>
  );
}
