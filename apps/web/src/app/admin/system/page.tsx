import { SimpleRoutePage } from "@/components/simple-route-page";

export default function AdminSystemPage() {
  return (
    <SimpleRoutePage
      protectedRoute
      title="System status"
      description="Web, worker, Postgres, Redis, object storage, email, and queue health."
    />
  );
}
