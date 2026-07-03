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

const workspaceLinks: NavigationItem[] = [
  { href: "/app/projects", label: "Projects", icon: FolderKanban },
  { href: "/app/design-profiles", label: "Design profiles", icon: Palette },
  { href: "/app/settings/presentations", label: "Presentation defaults", icon: FileText },
];

const settingsLinks: NavigationItem[] = [
  { href: "/app/settings/profile", label: "Profile", icon: UserRound },
  { href: "/app/settings/providers", label: "AI providers", icon: KeyRound },
  { href: "/app/settings/budget", label: "Budget", icon: BarChart3 },
  { href: "/app/settings/language", label: "Language", icon: SlidersHorizontal },
  { href: "/app/settings/security", label: "Security", icon: Shield },
];

type NavigationItem = {
  href: Route;
  icon: LucideIcon;
  label: string;
};

export function AppShell({ children }: { children: ReactNode }): ReactElement {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Workspace navigation">
        <Link href="/app/projects" className="app-brand" aria-label="Slide Agent projects">
          <span className="app-brand-mark">
            <LayoutTemplate size={20} aria-hidden="true" />
          </span>
          <span>
            <span className="app-brand-name">Slide Agent</span>
            <span className="app-brand-subtitle">Workspace</span>
          </span>
        </Link>

        <nav className="app-nav" aria-label="Primary">
          <NavigationSection items={workspaceLinks} pathname={pathname} title="Workspace" />
          <NavigationSection items={settingsLinks} pathname={pathname} title="Settings" />
        </nav>
      </aside>

      <div className="app-main-column">
        <header className="app-topbar">
          <div>
            <p className="app-eyebrow">Demo workspace</p>
            <p className="app-topbar-title">Create, import, manage, and export decks.</p>
          </div>
          <button type="button" className="app-logout-button" onClick={() => void signOut()}>
            <LogOut size={17} aria-hidden="true" />
            Sign out
          </button>
        </header>
        <main className="app-content">{children}</main>
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
  return (
    <section className="app-nav-section">
      <h2>{title}</h2>
      <ul>
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href}>
              <Link className={active ? "app-nav-link active" : "app-nav-link"} href={item.href}>
                <Icon size={17} aria-hidden="true" />
                <span>{item.label}</span>
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
