import { EditorShell } from "@/components/editor-shell";
import { getPresentationWorkflow } from "@/lib/presentation-workflow";
import { getAuthenticatedUserId } from "@/lib/server-session";
import { notFound, redirect } from "next/navigation";

type EditorPageProps = {
  params: Promise<{
    presentationId: string;
  }>;
};

export default async function EditorPage({ params }: EditorPageProps) {
  const { presentationId } = await params;
  const userId = await getAuthenticatedUserId();
  if (!userId)
    redirect(`/login?next=/app/presentations/${encodeURIComponent(presentationId)}/editor`);

  const workflow = await getPresentationWorkflow(userId, presentationId);
  if (!workflow) notFound();

  return (
    <EditorShell
      presentationId={presentationId}
      projectContext={{
        outputLanguage: workflow.outputLanguage,
        presentationTitle: workflow.title,
        projectId: workflow.project.id,
        projectName: workflow.project.name,
        status: workflow.status,
      }}
    />
  );
}
