import { SimpleRoutePage } from "@/components/simple-route-page";

export default function AdminProvidersPage() {
  return (
    <SimpleRoutePage
      protectedRoute
      title="Providers"
      description="Global provider availability and provider status metadata."
    />
  );
}
