import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalObjectStorage, sanitizeStorageKey } from "./index";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function createTempStorage(): Promise<{ rootDir: string; storage: LocalObjectStorage }> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "slide-agent-storage-"));
  tempDirs.push(rootDir);
  return { rootDir, storage: new LocalObjectStorage({ driver: "local", rootDir }) };
}

describe("LocalObjectStorage", () => {
  it("writes and reads objects below the storage root", async () => {
    const { rootDir, storage } = await createTempStorage();
    const bytes = new Uint8Array([
      112, 114, 101, 115, 101, 110, 116, 97, 116, 105, 111, 110, 32, 97, 115, 115, 101, 116,
    ]);

    await storage.putObject({ key: "assets/example.txt", mimeType: "text/plain", bytes });

    await expect(readFile(path.join(rootDir, "assets/example.txt"), "utf8")).resolves.toBe(
      "presentation asset",
    );
    const storedBytes = await storage.readObject({ key: "assets/example.txt" });
    expect(Array.from(storedBytes)).toEqual(Array.from(bytes));
  });

  it("rejects path traversal keys", async () => {
    const { storage } = await createTempStorage();

    await expect(
      storage.putObject({
        key: "../outside.txt",
        mimeType: "text/plain",
        bytes: new Uint8Array(),
      }),
    ).rejects.toThrow("path traversal");
  });
});

describe("sanitizeStorageKey", () => {
  it("normalizes separators and unsafe characters", () => {
    expect(sanitizeStorageKey(String.raw`uploads\Q3 deck!.pptx`)).toBe("uploads/Q3_deck_.pptx");
  });

  it("rejects empty keys", () => {
    expect(() => sanitizeStorageKey("/")).toThrow("must not be empty");
  });
});
