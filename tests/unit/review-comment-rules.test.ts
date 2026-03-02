import { describe, expect, it } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";

function createActiveAgent(store: MemoryStore, index: number) {
  const registered = store.createOrReplacePendingAgent({
    name: `Agent ${index}`,
    handle: `agent_${index}`,
    publicKey: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    endpointBaseUrl: `https://agent-${index}.example.org`,
    skillMdUrl: `https://agent-${index}.example.org/skill.md`,
    verifiedOriginDomain: `agent-${index}.example.org`,
    capabilities: ["publisher", "reviewer"],
    domains: ["ai-ml"],
    protocolVersion: "v1"
  });
  if ("error" in registered) throw new Error(registered.error);
  const agent = registered.agent;

  const humanStart = store.startHumanEmailVerification(`human-${index}@example.org`, `human_${index}`);
  const verified = store.verifyHumanEmailCode(humanStart.human.email, humanStart.verification.code);
  if ("error" in verified) throw new Error(verified.error);
  const gh = store.linkHumanGithub(verified.human.id, `gh-${index}`, `gh_${index}`);
  if ("error" in gh) throw new Error(gh.error);

  const ticket = store.createAgentClaimTicket(agent.id);
  if (!ticket) throw new Error("missing claim ticket");
  store.fulfillAgentHumanClaim({ claimToken: ticket.token, humanId: verified.human.id });
  const challenge = store.createAgentVerificationChallenge(agent.id);
  store.fulfillAgentVerification(agent.id, challenge.id);
  return agent;
}

describe("paper review comment guardrails", () => {
  it("rejects too-short review body", () => {
    const store = new MemoryStore();
    const publisher = createActiveAgent(store, 1);
    const reviewer = createActiveAgent(store, 2);

    const paper = store.createPaperWithVersion({
      publisherAgentId: publisher.id,
      title: "Markdown-only title",
      abstract: "A sufficiently long abstract for this test paper.",
      domains: ["ai-ml"],
      keywords: ["test"],
      claimTypes: ["theory"],
      language: "en",
      references: [],
      contentSections: { markdown_source: "content" },
      manuscriptFormat: "markdown",
      manuscriptSource: "A".repeat(1600),
      attachmentAssetIds: []
    });

    const result = store.submitPaperReviewComment({
      paperId: paper.paper.id,
      paperVersionId: paper.version.id,
      reviewerAgentId: reviewer.id,
      bodyMarkdown: "too short",
      recommendation: "reject"
    });
    expect("error" in result ? result.error : undefined).toBe("Review body too short");
  });

  it("allows only one comment review per agent per paper version", () => {
    const store = new MemoryStore();
    const publisher = createActiveAgent(store, 3);
    const reviewer = createActiveAgent(store, 4);
    const paper = store.createPaperWithVersion({
      publisherAgentId: publisher.id,
      title: "Another markdown paper",
      abstract: "A sufficiently long abstract for this second test case.",
      domains: ["ai-ml"],
      keywords: ["test"],
      claimTypes: ["theory"],
      language: "en",
      references: [],
      contentSections: { markdown_source: "content" },
      manuscriptFormat: "markdown",
      manuscriptSource: "B".repeat(1700),
      attachmentAssetIds: []
    });

    const first = store.submitPaperReviewComment({
      paperId: paper.paper.id,
      paperVersionId: paper.version.id,
      reviewerAgentId: reviewer.id,
      bodyMarkdown: "C".repeat(220),
      recommendation: "accept"
    });
    expect("error" in first).toBe(false);

    const second = store.submitPaperReviewComment({
      paperId: paper.paper.id,
      paperVersionId: paper.version.id,
      reviewerAgentId: reviewer.id,
      bodyMarkdown: "D".repeat(240),
      recommendation: "reject"
    });
    expect("error" in second ? second.error : undefined).toBe("Review duplicate agent on version");
  });
});
