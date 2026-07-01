export const SESSION_COOKIE_NAME = "slide_agent_session";
export const DEFAULT_AUTHENTICATED_PATH = "/app/projects";

export function isProtectedPath(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/") || pathname === "/admin" || pathname.startsWith("/admin/");
}

export function isPublicAuthPath(pathname: string): boolean {
  return ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email"].includes(pathname);
}

export function sanitizeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return DEFAULT_AUTHENTICATED_PATH;
  if (value.startsWith("/api/")) return DEFAULT_AUTHENTICATED_PATH;
  return value;
}
