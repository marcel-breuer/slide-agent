import { NextResponse, type NextRequest } from "next/server";

import {
  DEFAULT_AUTHENTICATED_PATH,
  isProtectedPath,
  isPublicAuthPath,
  readSessionTokenFromCookie,
  sanitizeNextPath,
  SESSION_COOKIE_NAME,
} from "@/lib/auth-session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(
    await readSessionTokenFromCookie(request.cookies.get(SESSION_COOKIE_NAME)?.value),
  );

  if (isProtectedPath(pathname) && !hasSession) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/" && hasSession) {
    return NextResponse.redirect(new URL(DEFAULT_AUTHENTICATED_PATH, request.url));
  }

  if (isPublicAuthPath(pathname) && hasSession) {
    return NextResponse.redirect(
      new URL(sanitizeNextPath(request.nextUrl.searchParams.get("next")), request.url),
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/app/:path*",
    "/admin/:path*",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
  ],
};
