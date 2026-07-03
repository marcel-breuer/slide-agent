import { SimpleRoutePage } from "@/components/simple-route-page";

export default function AdminModelsPage() {
  return (
    <SimpleRoutePage
      protectedRoute
      title="Models"
      description="Model catalog, capabilities, quality tiers, and routing priorities."
    />
  );
}
