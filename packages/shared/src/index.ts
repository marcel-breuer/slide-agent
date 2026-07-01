export type JsonObject = Record<string, unknown>;

export function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function createRequestId(prefix = "req"): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
