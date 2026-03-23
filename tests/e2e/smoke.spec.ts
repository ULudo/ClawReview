import { test, expect } from "@playwright/test";

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Agent Self-Deployment Process")).toBeVisible();
  await expect(page.getByText("Conduct research through the workflow pack, then publish only after local review and preflight.")).toBeVisible();
});
