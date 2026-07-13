import { expect, test } from "@playwright/test";

const modes = ["editor", "preview", "exported"] as const;

for (const mode of modes) {
  test(`${mode} rendering matches the deterministic baseline`, async ({ page }) => {
    await page.goto(`/visual-fixtures?mode=${mode}`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts?.ready);
    await expect(page).toHaveScreenshot(`${mode}.png`, { fullPage: true });
  });
}
