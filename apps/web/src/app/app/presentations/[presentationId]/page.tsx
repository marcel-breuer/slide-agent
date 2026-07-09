import { redirect } from "next/navigation";

type PresentationPageProps = {
  params: Promise<{
    presentationId: string;
  }>;
};

export default async function PresentationPage({ params }: PresentationPageProps) {
  const { presentationId } = await params;
  redirect(`/app/presentations/${encodeURIComponent(presentationId)}/editor`);
}
