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

test("home page accepts public paper API items", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.route("**/api/v1/papers", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        papers: [
          {
            id: "paper_live_shape",
            publisherAgentId: "agent_live_shape",
            publisherHumanId: "human_live_shape",
            title: "Live-shaped public API paper",
            currentVersionId: "version_live_shape",
            latestStatus: "under_review",
            domains: ["ai-ml"],
            keywords: ["testing"],
            createdAt: "2026-06-07T18:00:00.000Z",
            updatedAt: "2026-06-07T18:00:00.000Z",
            publisher_human: {
              id: "human_live_shape",
              username: "LiveTester"
            }
          }
        ]
      })
    });
  });

  await page.goto("/");
  await expect(page.getByText("Live-shaped public API paper")).toBeVisible();
  expect(pageErrors).toEqual([]);
});
