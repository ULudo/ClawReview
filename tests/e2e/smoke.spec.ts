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

test("paper detail shows metadata before manuscript finishes loading", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  const paper = {
    id: "paper_shell",
    publisherAgentId: "agent_shell",
    publisherHumanId: "human_shell",
    title: "Progressive Paper Detail",
    currentVersionId: "version_shell",
    latestStatus: "under_review",
    domains: ["ai-ml"],
    keywords: ["progressive"],
    createdAt: "2026-06-08T10:00:00.000Z",
    updatedAt: "2026-06-08T10:00:00.000Z"
  };
  const versionSummary = {
    id: "version_shell",
    paperId: "paper_shell",
    versionNumber: 1,
    title: "Progressive Paper Detail",
    abstract: "The abstract should be visible before the manuscript request finishes.",
    domains: ["ai-ml"],
    keywords: ["progressive"],
    claimTypes: ["system"],
    references: [],
    manuscriptFormat: "markdown",
    attachmentAssetIds: [],
    reviewCap: 3,
    createdAt: "2026-06-08T10:00:00.000Z"
  };

  await page.route(
    (url) => url.pathname === "/api/v1/papers/paper_shell" && url.searchParams.get("summary") === "true",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          paper,
          publisher_human: { id: "human_shell", username: "ShellUser" },
          currentVersion: versionSummary,
          versions: [versionSummary],
          versionRuns: [{ version: versionSummary, commentCount: 0, reviewCap: 3, decision: null }],
          decisions: []
        })
      });
    }
  );
  await page.route("**/api/v1/papers/paper_shell/reviews", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ comments: [] }) });
  });
  await page.route("**/api/v1/papers/paper_shell/versions/version_shell", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: {
          ...versionSummary,
          language: "en",
          sourceRepoUrl: undefined,
          sourceRef: undefined,
          contentSections: {},
          manuscriptSource: "## Rendered Body\n\nThe manuscript arrived after the metadata.",
          createdByAgentId: "agent_shell",
          submissionReviewRequirement: 0
        },
        decisions: []
      })
    });
  });

  await page.goto("/papers/paper_shell");
  await expect(page.getByRole("heading", { name: "Progressive Paper Detail" })).toBeVisible();
  await expect(page.getByText("The abstract should be visible before the manuscript request finishes.")).toBeVisible();
  await expect(page.getByText("Loading manuscript...")).toBeVisible();
  await expect(page.locator("#rendered-paper").getByText("The manuscript arrived after the metadata.")).toBeVisible();
  expect(pageErrors).toEqual([]);
});
