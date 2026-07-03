import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const StorageConfigSchema = z.object({
  driver: z.literal("local").default("local"),
  rootDir: z.string().min(1).default("/app/storage"),
});

export type StorageConfig = z.infer<typeof StorageConfigSchema>;

export type StoredObject = {
  key: string;
  mimeType: string;
  checksum?: string;
};

export class LocalObjectStorage {
  private readonly rootDir: string;

  constructor(config: StorageConfig) {
    this.rootDir = path.resolve(config.rootDir);
  }

  async putObject(input: StoredObject & { bytes: Uint8Array }): Promise<void> {
    const objectPath = this.objectPath(input.key);
    await mkdir(path.dirname(objectPath), { recursive: true });
    await writeFile(objectPath, input.bytes);
  }

  async readObject(input: Pick<StoredObject, "key">): Promise<Uint8Array> {
    return readFile(this.objectPath(input.key));
  }

  objectPath(key: string): string {
    const safeKey = sanitizeStorageKey(key);
    const objectPath = path.resolve(this.rootDir, safeKey);

    if (objectPath !== this.rootDir && !objectPath.startsWith(`${this.rootDir}${path.sep}`)) {
      throw new Error("Storage key must stay inside the storage root.");
    }

    return objectPath;
  }
}

export function createLocalObjectStorageFromEnv(
  env: Record<string, string | undefined> = process.env,
): LocalObjectStorage {
  const config = StorageConfigSchema.parse({
    driver: env.STORAGE_DRIVER ?? "local",
    rootDir: env.STORAGE_ROOT ?? "/app/storage",
  });

  return new LocalObjectStorage(config);
}

export function sanitizeStorageKey(key: string): string {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalized.split("/").filter(Boolean);

  if (segments.length === 0) {
    throw new Error("Storage key must not be empty.");
  }

  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Storage key must not contain path traversal segments.");
  }

  return segments.map((segment) => segment.replace(/[^a-zA-Z0-9_.,=-]/g, "_")).join("/");
}

export function assertAllowedMimeType(mimeType: string, allowed: readonly string[]): void {
  if (!allowed.includes(mimeType)) {
    throw new Error(`Unsupported MIME type: ${mimeType}`);
  }
}
