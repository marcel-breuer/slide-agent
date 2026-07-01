import { EditorShell } from "@/components/editor-shell";

type EditorPageProps = {
  params: Promise<{
    presentationId: string;
  }>;
};

export default async function EditorPage({ params }: EditorPageProps) {
  const { presentationId } = await params;
  return <EditorShell presentationId={presentationId} />;
}
