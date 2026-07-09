import { AppShell } from "@/components/app-shell";
import { ProjectDetailWorkspace } from "@/components/project-detail-workspace";

type ProjectPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;

  return (
    <AppShell>
      <ProjectDetailWorkspace projectId={projectId} />
    </AppShell>
  );
}
