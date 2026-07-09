import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { PresentationExportWorkspace } from "@/components/presentation-export-workspace";
import { PresentationWorkflowLayout } from "@/components/presentation-workflow-layout";
import { getPresentationWorkflow } from "@/lib/presentation-workflow";
import { getAuthenticatedUserId } from "@/lib/server-session";

type ExportPageProps = {
  params: Promise<{
    presentationId: string;
  }>;
};

export default async function ExportPage({ params }: ExportPageProps) {
  const { presentationId } = await params;
  const userId = await getAuthenticatedUserId();
  if (!userId)
    redirect(`/login?next=/app/presentations/${encodeURIComponent(presentationId)}/export`);

  const workflow = await getPresentationWorkflow(userId, presentationId);
  if (!workflow) notFound();

  return (
    <AppShell>
      <PresentationWorkflowLayout activeStep="export" workflow={workflow}>
        <PresentationExportWorkspace
          archived={Boolean(workflow.archivedAt)}
          exports={workflow.exports}
          presentationId={workflow.id}
        />
      </PresentationWorkflowLayout>
    </AppShell>
  );
}
