"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import {
  BarChart3,
  FileText,
  FolderKanban,
  KeyRound,
  LayoutTemplate,
  LogOut,
  Palette,
  Shield,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { UiLocaleProvider, useUiLocale } from "@/lib/ui-locale";

import { cn } from "./ui";

const workspaceLinks: NavigationItem[] = [
  { href: "/app/projects", labelKey: "navProjects", icon: FolderKanban },
  { href: "/app/design-profiles", labelKey: "navDesignProfiles", icon: Palette },
  { href: "/app/settings/presentations", labelKey: "navPresentationDefaults", icon: FileText },
];

const settingsLinks: NavigationItem[] = [
  { href: "/app/settings/profile", labelKey: "navProfile", icon: UserRound },
  { href: "/app/settings/providers", labelKey: "navAiProviders", icon: KeyRound },
  { href: "/app/settings/budget", labelKey: "navBudget", icon: BarChart3 },
  { href: "/app/settings/language", labelKey: "navLanguage", icon: SlidersHorizontal },
  { href: "/app/settings/security", labelKey: "navSecurity", icon: Shield },
];

type NavigationItem = {
  href: Route;
  icon: LucideIcon;
  labelKey:
    | "navAiProviders"
    | "navBudget"
    | "navDesignProfiles"
    | "navLanguage"
    | "navPresentationDefaults"
    | "navProfile"
    | "navProjects"
    | "navSecurity";
};

export function AppShell({ children }: { children: ReactNode }): ReactElement {
  return (
    <UiLocaleProvider>
      <AppShellContent>{children}</AppShellContent>
    </UiLocaleProvider>
  );
}

function AppShellContent({ children }: { children: ReactNode }): ReactElement {
  const pathname = usePathname();
  const { msg } = useUiLocale();

  return (
    <div className="grid min-h-screen grid-cols-[264px_minmax(0,1fr)] bg-canvas max-[960px]:grid-cols-1">
      <aside
        className="sticky top-0 flex h-screen flex-col border-r border-line bg-white px-4 py-5 max-[960px]:static max-[960px]:h-auto max-[960px]:border-b max-[960px]:border-r-0 max-[520px]:p-4"
        aria-label="Workspace navigation"
      >
        <Link
          href="/app/projects"
          className="flex items-center gap-3 rounded-lg p-2 text-ink no-underline hover:bg-canvas"
          aria-label={`${msg("appName")} ${msg("navProjects")}`}
        >
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-white">
            <LayoutTemplate size={20} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-[15px] font-extrabold leading-tight">{msg("appName")}</span>
            <span className="mt-0.5 block text-xs font-semibold text-muted">
              {msg("workspace")}
            </span>
          </span>
        </Link>

        <nav
          className="mt-7 grid gap-6 max-[960px]:grid-cols-2 max-[520px]:grid-cols-1"
          aria-label="Primary"
        >
          <NavigationSection items={workspaceLinks} pathname={pathname} title={msg("workspace")} />
          <NavigationSection items={settingsLinks} pathname={pathname} title={msg("navSettings")} />
        </nav>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-10 flex min-h-[72px] items-center justify-between gap-5 border-b border-line bg-canvas/90 px-7 backdrop-blur max-[960px]:static max-[520px]:flex-col max-[520px]:items-stretch max-[520px]:p-4">
          <div>
            <p className="m-0 text-xs font-extrabold uppercase tracking-wide text-muted">
              {msg("appShellWorkspaceLabel")}
            </p>
            <p className="mt-1 text-sm font-bold text-ink">{msg("appShellSubtitle")}</p>
          </div>
          <button
            type="button"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-bold text-ink hover:border-primary hover:text-primary max-[520px]:w-full"
            onClick={() => void signOut()}
          >
            <LogOut size={17} aria-hidden="true" />
            {msg("signOut")}
          </button>
        </header>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}

function NavigationSection({
  items,
  pathname,
  title,
}: {
  items: NavigationItem[];
  pathname: string;
  title: string;
}): ReactElement {
  const { msg } = useUiLocale();

  return (
    <section>
      <h2 className="mb-2 px-2 text-[11px] font-extrabold uppercase tracking-wide text-muted">
        {title}
      </h2>
      <ul className="grid list-none gap-1 p-0">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href}>
              <Link
                className={cn(
                  "flex min-h-[38px] items-center gap-2.5 rounded-lg px-2.5 text-sm font-bold text-muted no-underline hover:bg-canvas hover:text-ink",
                  active && "active bg-primary/10 text-primary",
                )}
                href={item.href}
              >
                <Icon size={17} aria-hidden="true" />
                <span>{msg(item.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

async function signOut(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
  globalThis.location.assign("/login");
}
