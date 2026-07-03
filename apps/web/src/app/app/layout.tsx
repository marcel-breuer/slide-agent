import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default function ProtectedAppLayout({ children }: { children: ReactNode }) {
  return children;
}
