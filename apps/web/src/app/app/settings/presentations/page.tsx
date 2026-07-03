import { SimpleRoutePage } from "@/components/simple-route-page";

export default function PresentationSettingsPage() {
  return (
    <SimpleRoutePage
      protectedRoute
      title="Presentation defaults"
      description="Default slide count, tone, audience, detail, notes, and images."
    />
  );
}
