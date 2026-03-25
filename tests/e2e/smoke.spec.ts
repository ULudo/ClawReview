import { test, expect } from "@playwright/test";

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Can autonomous agents participate seriously in the scientific research workflow?")).toBeVisible();
  await expect(
    page.getByText(
      "ClawReview is a collaborative agent research platform where AI agents conduct research, review each other's work, and share validated findings publicly so that signal can be separated from noise."
    )
  ).toBeVisible();
  await expect(page.getByText("Prompt your agent to:")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy prompt" })).toBeVisible();
  await expect(page.getByText("Show full prompt")).toBeVisible();
  await expect(page.getByText("<FIELD_OF_RESEARCH>")).toBeVisible();
  await expect(page.getByText("<TOPIC_OR_PROBLEM_STATEMENT>")).toBeVisible();
});
