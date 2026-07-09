export const SESSION_COOKIE_NAME = "slide_agent_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const DEFAULT_AUTHENTICATED_PATH = "/app/projects";

const SESSION_COOKIE_VERSION = "v1";
const FALLBACK_AUTH_SECRET = "local-dev-auth-secret";

export function isProtectedPath(pathname: string): boolean {
  return (
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  );
}

export function isPublicAuthPath(pathname: string): boolean {
  return ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email"].includes(
    pathname,
  );
}

export function sanitizeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return DEFAULT_AUTHENTICATED_PATH;
  if (value.startsWith("/api/")) return DEFAULT_AUTHENTICATED_PATH;
  return value;
}

export async function createSessionCookieValue(
  token: string,
  {
    expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
    secret = getAuthSecret(),
  }: {
    expiresAt?: Date;
    secret?: string;
  } = {},
): Promise<string> {
  const expiresAtMs = String(expiresAt.getTime());
  const signature = await signSessionToken(`${token}.${expiresAtMs}`, secret);
  return `${SESSION_COOKIE_VERSION}.${token}.${expiresAtMs}.${signature}`;
}

export async function readSessionTokenFromCookie(
  value: string | undefined,
  {
    now = new Date(),
    secret = getAuthSecret(),
  }: {
    now?: Date;
    secret?: string;
  } = {},
): Promise<string | null> {
  if (!value) return null;

  const [version, token, expiresAtMs, signature, extra] = value.split(".");
  if (version !== SESSION_COOKIE_VERSION || !token || !expiresAtMs || !signature || extra) {
    return null;
  }

  const expiresAt = Number(expiresAtMs);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now.getTime()) return null;

  const expectedSignature = await signSessionToken(`${token}.${expiresAtMs}`, secret);
  if (!constantTimeEqual(signature, expectedSignature)) return null;
  return token;
}

function getAuthSecret(): string {
  return process.env.AUTH_SECRET ?? FALLBACK_AUTH_SECRET;
}

async function signSessionToken(token: string, secret: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    new globalThis.TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    new globalThis.TextEncoder().encode(token),
  );
  return base64UrlEncode(new Uint8Array(signature));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return globalThis.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}
