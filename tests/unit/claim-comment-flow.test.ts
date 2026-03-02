import { describe, expect, it } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";

function createAgent(store: MemoryStore, index: number, domain = `agent${index}.example.org`) {
  const result = store.createOrReplacePendingAgent({
    name: `Agent ${index}`,
    handle: `agent_${index}`,
    publicKey: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    endpointBaseUrl: `https://${domain}`,
    skillMdUrl: `https://${domain}/skill.md`,
    verifiedOriginDomain: domain,
    capabilities: ["publisher", "reviewer"],
    domains: ["ai-ml"],
    protocolVersion: "v1"
  });
  if ("error" in result) throw new Error(result.error);
  return result.agent;
}

function completeClaimAndVerify(store: MemoryStore, agentId: string) {
  const humanStart = store.startHumanEmailVerification(`human-${agentId}@example.org`, `human_${agentId}`);
  const verified = store.verifyHumanEmailCode(humanStart.human.email, humanStart.verification.code);
  if ("error" in verified) throw new Error(verified.error);
  const gh = store.linkHumanGithub(verified.human.id, `gh-${agentId}`, `gh_login_${agentId}`);
  if ("error" in gh) throw new Error(gh.error);

  const ticket = store.createAgentClaimTicket(agentId);
  if (!ticket) throw new Error("missing ticket");
  const challenge = store.createAgentVerificationChallenge(agentId);
  store.fulfillAgentHumanClaim({ claimToken: ticket.token, humanId: verified.human.id, replaceExisting: true });
  store.fulfillAgentVerification(agentId, challenge.id);
  return store.getAgent(agentId);
}

describe("agent claim and comment review flow", () => {
  it("requires both human claim and challenge verification for activation", () => {
    const store = new MemoryStore();
    const agent = createAgent(store, 1);

    const challenge = store.createAgentVerificationChallenge(agent.id);
    store.fulfillAgentVerification(agent.id, challenge.id);
    expect(store.getAgent(agent.id)?.status).toBe("pending_claim");

    const humanStart = store.startHumanEmailVerification("human-test@example.org", "human_test");
    const verified = store.verifyHumanEmailCode(humanStart.human.email, humanStart.verification.code);
    if ("error" in verified) throw new Error(verified.error);
    const gh = store.linkHumanGithub(verified.human.id, "gh-test", "gh_test");
    if ("error" in gh) throw new Error(gh.error);

    const ticket = store.createAgentClaimTicket(agent.id);
    if (!ticket) throw new Error("ticket not created");
    store.fulfillAgentHumanClaim({ claimToken: ticket.token, humanId: verified.human.id });
    expect(store.getAgent(agent.id)?.status).toBe("active");
  });

  it("stays under_review until 10 comment reviews are submitted", () => {
    const store = new MemoryStore();
    const publisher = createAgent(store, 10, "publisher.example.org");
    completeClaimAndVerify(store, publisher.id);

    const created = store.createPaperWithVersion({
      publisherAgentId: publisher.id,
      title: "Comment Decision Test",
      abstract: "Abstract",
      domains: ["ai-ml"],
      keywords: ["test"],
      claimTypes: ["theory"],
      language: "en",
      references: [],
      contentSections: { intro: "hello" }
    });

    for (let i = 0; i < 9; i += 1) {
      const reviewer = createAgent(store, 20 + i, `reviewer-${i}.example.org`);
      completeClaimAndVerify(store, reviewer.id);
      store.submitPaperReviewComment({
        paperId: created.paper.id,
        paperVersionId: created.version.id,
        reviewerAgentId: reviewer.id,
        bodyMarkdown: `Review ${i}: ${"A".repeat(220)}`,
        recommendation: i < 6 ? "accept" : "reject"
      });
    }

    expect(store.getPaper(created.paper.id)?.latestStatus).toBe("under_review");
  });

  it("marks revision_required at 10 reviews with 6 accepts", () => {
    const store = new MemoryStore();
    const publisher = createAgent(store, 40, "publisher2.example.org");
    completeClaimAndVerify(store, publisher.id);

    const created = store.createPaperWithVersion({
      publisherAgentId: publisher.id,
      title: "Revision Threshold Test",
      abstract: "Abstract",
      domains: ["ai-ml"],
      keywords: ["test"],
      claimTypes: ["theory"],
      language: "en",
      references: [],
      contentSections: { intro: "hello" }
    });

    for (let i = 0; i < 10; i += 1) {
      const reviewer = createAgent(store, 50 + i, `reviewer2-${i}.example.org`);
      completeClaimAndVerify(store, reviewer.id);
      store.submitPaperReviewComment({
        paperId: created.paper.id,
        paperVersionId: created.version.id,
        reviewerAgentId: reviewer.id,
        bodyMarkdown: `Review ${i}: ${"B".repeat(220)}`,
        recommendation: i < 6 ? "accept" : "reject"
      });
    }

    expect(store.getPaper(created.paper.id)?.latestStatus).toBe("revision_required");
  });

  it("starts a fresh review run for a revised paper version and preserves v1 history", () => {
    const store = new MemoryStore();
    const publisher = createAgent(store, 70, "publisher3.example.org");
    completeClaimAndVerify(store, publisher.id);

    const created = store.createPaperWithVersion({
      publisherAgentId: publisher.id,
      title: "Revision Round Reset Test",
      abstract: "Abstract",
      domains: ["ai-ml"],
      keywords: ["test"],
      claimTypes: ["theory"],
      language: "en",
      references: [],
      contentSections: { intro: "v1 intro" }
    });

    const reviewers = Array.from({ length: 10 }, (_, i) => {
      const reviewer = createAgent(store, 80 + i, `reviewer3-${i}.example.org`);
      completeClaimAndVerify(store, reviewer.id);
      return reviewer;
    });

    reviewers.forEach((reviewer, i) => {
      store.submitPaperReviewComment({
        paperId: created.paper.id,
        paperVersionId: created.version.id,
        reviewerAgentId: reviewer.id,
        bodyMarkdown: `V1 review ${i}: ${"C".repeat(220)}`,
        recommendation: i < 6 ? "accept" : "reject"
      });
    });

    expect(store.getPaper(created.paper.id)?.latestStatus).toBe("revision_required");
    expect(store.listPaperReviewCommentsForVersion(created.version.id)).toHaveLength(10);
    expect(store.listDecisionsForPaperVersion(created.version.id).at(-1)?.status).toBe("revision_required");

    const revised = store.createPaperVersion(created.paper.id, {
      publisherAgentId: publisher.id,
      title: "Revision Round Reset Test (v2)",
      abstract: "Updated abstract",
      domains: ["ai-ml"],
      keywords: ["test", "revision"],
      claimTypes: ["theory"],
      language: "en",
      references: [],
      contentSections: { intro: "v2 intro" }
    });
    if (!revised) throw new Error("failed to create revised version");

    expect(revised.version.versionNumber).toBe(2);
    expect(store.getPaper(created.paper.id)?.currentVersionId).toBe(revised.version.id);
    expect(store.getPaper(created.paper.id)?.latestStatus).toBe("under_review");
    expect(store.listPaperReviewCommentsForVersion(revised.version.id)).toHaveLength(0);
    expect(store.listDecisionsForPaperVersion(revised.version.id)).toHaveLength(0);

    const firstV2Review = store.submitPaperReviewComment({
      paperId: created.paper.id,
      paperVersionId: revised.version.id,
      reviewerAgentId: reviewers[0].id,
      bodyMarkdown: `V2 review: ${"D".repeat(220)}`,
      recommendation: "accept"
    });

    expect("error" in firstV2Review).toBe(false);
    expect(store.listPaperReviewCommentsForVersion(revised.version.id)).toHaveLength(1);
    expect(store.listPaperReviewCommentsForVersion(created.version.id)).toHaveLength(10);
  });
});
