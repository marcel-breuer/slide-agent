import { redirect } from "next/navigation";

export default function SecuritySettingsPage() {
  redirect("/app/settings/account");
}
