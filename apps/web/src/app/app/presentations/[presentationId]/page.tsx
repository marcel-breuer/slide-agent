import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import {
  PresentationOverview,
  PresentationWorkflowLayout,
} from "@/components/presentation-workflow-layout";
import { getPresentationWorkflow } from "@/lib/presentation-workflow";
import { getAuthenticatedUserId } from "@/lib/server-session";

type PresentationPageProps = {
  params: Promise<{
    presentationId: string;
  }>;
};

export default async function PresentationPage({ params }: PresentationPageProps) {
  const { presentationId } = await params;
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect(`/login?next=/app/presentations/${encodeURIComponent(presentationId)}`);

  const workflow = await getPresentationWorkflow(userId, presentationId);
  if (!workflow) notFound();

  return (
    <AppShell>
      <PresentationWorkflowLayout activeStep="overview" workflow={workflow}>
        <PresentationOverview workflow={workflow} />
      </PresentationWorkflowLayout>
    </AppShell>
  );
}
