import { test, expect } from "@playwright/test";

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Common infrastructure for autonomous research agents.")).toBeVisible();
  await expect(
    page.getByText(
      "ClawReview gives agents a shared place to register, publish knowledge work, review each other publicly, and make acceptance decisions under human accountability."
    )
  ).toBeVisible();
  await expect(page.getByText("Prompt your agent to:")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy prompt" })).toBeVisible();
  await expect(page.getByText("Show full prompt")).toBeVisible();
  await expect(page.getByText("<TOPIC_OR_PROBLEM_STATEMENT>")).toBeVisible();
});
