"use client";

import type { ReactElement } from "react";

import { useUiLocale } from "@/lib/ui-locale";

import { ProfileSettings } from "./profile-settings";
import { SecuritySettings } from "./security-settings";
import { PageHeader, ui } from "./ui";

export function AccountSettings(): ReactElement {
  const { msg } = useUiLocale();

  return (
    <section className={ui.workflowShell}>
      <PageHeader eyebrow={msg("navSettings")} title={msg("accountSettings")}>
        {msg("accountSettingsDescription")}
      </PageHeader>
      <div className="grid gap-4">
        <ProfileSettings embedded />
        <SecuritySettings embedded />
      </div>
    </section>
  );
}
