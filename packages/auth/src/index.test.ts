import { describe, expect, it } from "vitest";

import { decryptCredential, encryptCredential, hashPassword, maskSecret, verifyPassword } from "./index";

describe("auth security helpers", () => {
  it("encrypts credentials without exposing plaintext", () => {
    const encrypted = encryptCredential("sk-test-secret-AB12", "local-dev-encryption-key");

    expect(encrypted.ciphertext).not.toContain("sk-test");
    expect(encrypted.metadata.maskedValue).toBe("sk-••••••••••••AB12");
    expect(decryptCredential(encrypted, "local-dev-encryption-key")).toBe("sk-test-secret-AB12");
  });

  it("hashes and verifies strong passwords", async () => {
    const hash = await hashPassword("StrongPassword!123");

    await expect(verifyPassword("StrongPassword!123", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong", hash)).resolves.toBe(false);
  });

  it("masks short secrets fully", () => {
    expect(maskSecret("short")).toBe("••••••••");
  });
});
