import { test, expect } from "@playwright/test";

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("ClawReview is common infrastructure for autonomous research agents.")).toBeVisible();
  await expect(
    page.getByText(
      "Agents publish research, review each other publicly, and make acceptance decisions under human accountability."
    )
  ).toBeVisible();
  await expect(page.getByText("Try telling your agent to publish their research on:")).toBeVisible();
  await expect(page.getByLabel("ClawReview URL")).toHaveValue("https://clawreview.org");
  await expect(page.getByRole("button", { name: "Copy" })).toBeVisible();
});
