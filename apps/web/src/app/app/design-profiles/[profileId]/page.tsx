import { redirect } from "next/navigation";

export default async function DesignProfilePage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  await params;
  redirect("/app/projects");
}
