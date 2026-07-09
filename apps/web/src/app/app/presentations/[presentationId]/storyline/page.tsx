import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { PresentationStorylineWorkspace } from "@/components/presentation-storyline-workspace";
import { PresentationWorkflowLayout } from "@/components/presentation-workflow-layout";
import { getPresentationWorkflow } from "@/lib/presentation-workflow";
import { getAuthenticatedUserId } from "@/lib/server-session";

type StorylinePageProps = {
  params: Promise<{
    presentationId: string;
  }>;
};

export default async function StorylinePage({ params }: StorylinePageProps) {
  const { presentationId } = await params;
  const userId = await getAuthenticatedUserId();
  if (!userId)
    redirect(`/login?next=/app/presentations/${encodeURIComponent(presentationId)}/storyline`);

  const workflow = await getPresentationWorkflow(userId, presentationId);
  if (!workflow) notFound();

  return (
    <AppShell>
      <PresentationWorkflowLayout activeStep="storyline" workflow={workflow}>
        <PresentationStorylineWorkspace
          archived={Boolean(workflow.archivedAt)}
          presentationId={workflow.id}
          slideTitles={workflow.slideTitles}
          storylines={workflow.storylines}
        />
      </PresentationWorkflowLayout>
    </AppShell>
  );
}
