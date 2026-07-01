import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";

export const StorageConfigSchema = z.object({
  endpoint: z.string().url(),
  region: z.string().default("us-east-1"),
  accessKeyId: z.string(),
  secretAccessKey: z.string(),
  forcePathStyle: z.boolean().default(true)
});

export type StorageConfig = z.infer<typeof StorageConfigSchema>;

export type StoredObject = {
  bucket: string;
  key: string;
  mimeType: string;
  checksum?: string;
};

export class S3ObjectStorage {
  private readonly client: S3Client;

  constructor(config: StorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    });
  }

  async putObject(input: StoredObject & { bytes: Uint8Array }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: sanitizeStorageKey(input.key),
        Body: input.bytes,
        ContentType: input.mimeType,
        ChecksumSHA256: input.checksum
      })
    );
  }

  async signedReadUrl(input: Pick<StoredObject, "bucket" | "key">, expiresInSeconds = 300): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: input.bucket, Key: sanitizeStorageKey(input.key) }),
      { expiresIn: expiresInSeconds }
    );
  }
}

export function sanitizeStorageKey(key: string): string {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.includes("..")) {
    throw new Error("Storage key must not contain path traversal segments.");
  }
  return normalized.replace(/[^a-zA-Z0-9/_.,=-]/g, "_");
}

export function assertAllowedMimeType(mimeType: string, allowed: readonly string[]): void {
  if (!allowed.includes(mimeType)) {
    throw new Error(`Unsupported MIME type: ${mimeType}`);
  }
}
