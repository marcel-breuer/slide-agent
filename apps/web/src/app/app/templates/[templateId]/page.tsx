import { AppShell } from "@/components/app-shell";
import { ReusableAssetDetail } from "@/components/reusable-asset-detail";

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;

  return (
    <AppShell>
      <ReusableAssetDetail assetId={templateId} />
    </AppShell>
  );
}
