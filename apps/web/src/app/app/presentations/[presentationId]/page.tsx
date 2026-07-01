import { redirect } from "next/navigation";

export default function PresentationPage() {
  redirect("/app/presentations/demo-presentation/editor");
}
