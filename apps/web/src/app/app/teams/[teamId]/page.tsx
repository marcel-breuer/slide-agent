import { AppShell } from "@/components/app-shell";
import { TeamsWorkspace } from "@/components/teams-workspace";

export default async function TeamPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  return (
    <AppShell>
      <TeamsWorkspace teamId={teamId} />
    </AppShell>
  );
}
