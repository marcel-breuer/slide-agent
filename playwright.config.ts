import { defineConfig } from "@playwright/test";

export default defineConfig({
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixels: 0,
      scale: "css",
    },
  },
  outputDir: "test-results/visual",
  snapshotDir: "tests/visual/snapshots",
  testDir: "tests/visual",
  use: {
    baseURL: process.env.VISUAL_BASE_URL ?? "http://127.0.0.1:3000",
    colorScheme: "light",
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    viewport: { height: 900, width: 1600 },
  },
  workers: 1,
});
