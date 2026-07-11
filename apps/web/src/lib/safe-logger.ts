const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|credential|password|prompt|secret|storageurl|token|url)/i;

type LogLevel = "error" | "info" | "warn";

export function logSafe(level: LogLevel, message: string, context: Record<string, unknown> = {}) {
  const entry = {
    context: sanitizeLogValue(context),
    level,
    message,
    timestamp: new Date().toISOString(),
  };

  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.warn(line);
}

function sanitizeLogValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeLogValue(entry));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : sanitizeLogValue(entry),
      ]),
    );
  }

  if (value instanceof Error) {
    return { message: value.message, name: value.name };
  }

  return value;
}
