import { SimpleRoutePage } from "@/components/simple-route-page";

export default function AdminPricingPage() {
  return (
    <SimpleRoutePage
      protectedRoute
      title="Pricing"
      description="Provider pricing, exchange rates, and effective dates."
    />
  );
}
