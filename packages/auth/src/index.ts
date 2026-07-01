import { randomBytes, scryptSync, timingSafeEqual, createCipheriv, createDecipheriv } from "node:crypto";

export type EncryptedCredential = {
  ciphertext: string;
  nonce: string;
  authTag: string;
  keyVersion: string;
  algorithm: "aes-256-gcm";
  metadata: {
    maskedValue: string;
    createdAt: string;
  };
};

export function assertStrongPassword(password: string): void {
  const checks = [
    password.length >= 12,
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^a-zA-Z0-9]/.test(password)
  ];

  if (!checks.every(Boolean)) {
    throw new Error("Password does not meet the strength policy.");
  }
}

export async function hashPassword(password: string): Promise<string> {
  assertStrongPassword(password);
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [scheme, salt, expectedHash] = encoded.split("$");
  if (scheme !== "scrypt" || !salt || !expectedHash) return false;
  const actual = Buffer.from(scryptSync(password, salt, 64).toString("hex"), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function encryptionKeyFromSecret(secret: string): Buffer {
  if (!secret) throw new Error("CREDENTIAL_ENCRYPTION_KEY is required.");
  const decoded = Buffer.from(secret, "base64");
  if (decoded.length === 32) return decoded;
  return scryptSync(secret, "slide-agent-credential-key", 32);
}

export function maskSecret(value: string): string {
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 3)}••••••••••••${value.slice(-4)}`;
}

export function encryptCredential(value: string, secret: string, keyVersion = "v1"): EncryptedCredential {
  const key = encryptionKeyFromSecret(secret);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: authTag.toString("base64"),
    keyVersion,
    algorithm: "aes-256-gcm",
    metadata: {
      maskedValue: maskSecret(value),
      createdAt: new Date().toISOString()
    }
  };
}

export function decryptCredential(value: EncryptedCredential, secret: string): string {
  const key = encryptionKeyFromSecret(secret);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(value.nonce, "base64"));
  decipher.setAuthTag(Buffer.from(value.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}

export function redactSensitiveText(input: string): string {
  return input
    .replace(/sk-[a-zA-Z0-9_-]{12,}/g, "sk-[REDACTED]")
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/g, "Bearer [REDACTED]");
}
