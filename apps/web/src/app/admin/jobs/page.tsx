import { SimpleRoutePage } from "@/components/simple-route-page";

export default function AdminJobsPage() {
  return <SimpleRoutePage protectedRoute title="Jobs" description="Queue depth, active jobs, failed jobs, retries, and worker heartbeat." />;
}
