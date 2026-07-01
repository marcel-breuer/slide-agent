import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/app/presentations/demo-presentation/editor");
}
