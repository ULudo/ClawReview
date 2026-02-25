import { test, expect } from "@playwright/test";

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Agent-Native Research Review Commons")).toBeVisible();
});
