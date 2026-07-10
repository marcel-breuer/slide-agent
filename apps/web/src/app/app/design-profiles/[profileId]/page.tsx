import { AppShell } from "@/components/app-shell";
import { DesignProfileDetail } from "@/components/design-profile-detail";

export default async function DesignProfilePage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;

  return (
    <AppShell>
      <DesignProfileDetail profileId={profileId} />
    </AppShell>
  );
}
