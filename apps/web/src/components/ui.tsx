/* global HTMLButtonElement */

import Link from "next/link";
import type { Route } from "next";
import type { ButtonHTMLAttributes, ComponentProps, ReactElement, ReactNode } from "react";

export function cn(...classes: Array<false | null | string | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export const ui = {
  actionRow: "flex flex-wrap items-center justify-end gap-2 max-[960px]:justify-start",
  alert: "mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800",
  badge:
    "inline-flex shrink-0 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-extrabold text-gray-600",
  badgeReady: "border-emerald-200 bg-emerald-50 text-emerald-800",
  card: "rounded-lg border border-line bg-white p-[18px] shadow-sm",
  cardHeader: "mb-4 flex items-start justify-between gap-4 max-[960px]:flex-col",
  empty: "rounded-lg border border-dashed border-line bg-white p-4 text-sm text-muted",
  field: "grid gap-1.5 text-xs font-extrabold uppercase tracking-wide text-muted",
  form: "mb-6 grid items-end gap-3 rounded-lg border border-line bg-white p-4 md:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_auto]",
  iconButton:
    "inline-flex h-10 w-10 items-center justify-center gap-2 rounded-lg border border-line bg-white text-sm font-extrabold text-ink hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-70",
  input:
    "h-[42px] min-w-0 rounded-lg border border-line bg-white px-3 text-sm font-medium normal-case text-ink",
  item: "flex items-start justify-between gap-4 rounded-lg border border-line bg-white p-4 max-[960px]:flex-col",
  itemMain: "grid min-w-0 gap-2",
  itemMeta: "text-[13px] font-bold text-muted",
  itemTitle: "flex min-w-0 items-center gap-2 text-base font-extrabold text-ink",
  itemTitleLink: "truncate text-inherit no-underline hover:text-primary",
  kicker: "text-xs font-extrabold uppercase tracking-wide text-muted",
  list: "grid list-none gap-2.5 p-0",
  muted: "text-sm leading-6 text-muted",
  pageHeader: "mb-5 flex items-start justify-between gap-5 max-[960px]:flex-col",
  pageShell: "mx-auto w-full max-w-[1120px] px-6 py-8 max-[520px]:px-4 max-[520px]:py-5",
  section: "mt-6",
  sectionTitle: "mb-3 text-base font-extrabold leading-snug text-ink",
  settingsForm: "grid gap-3.5 md:grid-cols-2",
  success:
    "mb-3.5 inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-extrabold text-emerald-800",
  title: "mt-1 text-[28px] font-extrabold leading-tight text-ink",
  workflowShell: "mx-auto w-full max-w-[1180px] px-6 py-8 max-[520px]:px-4 max-[520px]:py-5",
};

export function Button({
  children,
  className,
  variant = "secondary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "danger" | "primary" | "secondary";
}): ReactElement {
  return (
    <button className={cn(buttonClasses(variant), className)} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  children,
  className,
  href,
  variant = "secondary",
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & {
  href: Route | string;
  variant?: "danger" | "primary" | "secondary";
}): ReactElement {
  return (
    <Link className={cn(buttonClasses(variant), className)} href={href as Route} {...props}>
      {children}
    </Link>
  );
}

export function PageHeader({
  actions,
  children,
  eyebrow,
  title,
}: {
  actions?: ReactNode;
  children?: ReactNode;
  eyebrow: string;
  title: string;
}): ReactElement {
  return (
    <div className={ui.pageHeader}>
      <div>
        <p className={ui.kicker}>{eyebrow}</p>
        <h1 className={ui.title}>{title}</h1>
        {children ? <div className="mt-2 text-sm leading-6 text-muted">{children}</div> : null}
      </div>
      {actions ? <div className={ui.actionRow}>{actions}</div> : null}
    </div>
  );
}

function buttonClasses(variant: "danger" | "primary" | "secondary"): string {
  const base =
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3.5 text-sm font-extrabold no-underline transition disabled:cursor-not-allowed disabled:opacity-70";

  if (variant === "primary") {
    return cn(base, "border-primary bg-primary text-white hover:bg-primary-strong");
  }

  if (variant === "danger") {
    return cn(base, "border-red-200 bg-white text-red-800 hover:border-red-500 hover:bg-red-50");
  }

  return cn(base, "border-line bg-white text-ink hover:border-primary hover:text-primary");
}
