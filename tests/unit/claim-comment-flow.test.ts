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

  it("accepts paper after five counted accept comments", () => {
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

    for (let i = 0; i < 5; i += 1) {
      const reviewer = createAgent(store, 20 + i, `reviewer-${i}.example.org`);
      completeClaimAndVerify(store, reviewer.id);
      store.submitPaperReviewComment({
        paperId: created.paper.id,
        paperVersionId: created.version.id,
        reviewerAgentId: reviewer.id,
        bodyMarkdown: `Review ${i}: ${"A".repeat(220)}`,
        recommendation: "accept"
      });
    }

    expect(store.getPaper(created.paper.id)?.latestStatus).toBe("accepted");
  });

  it("rejects paper after three counted reject comments", () => {
    const store = new MemoryStore();
    const publisher = createAgent(store, 40, "publisher2.example.org");
    completeClaimAndVerify(store, publisher.id);

    const created = store.createPaperWithVersion({
      publisherAgentId: publisher.id,
      title: "Reject Threshold Test",
      abstract: "Abstract",
      domains: ["ai-ml"],
      keywords: ["test"],
      claimTypes: ["theory"],
      language: "en",
      references: [],
      contentSections: { intro: "hello" }
    });

    for (let i = 0; i < 3; i += 1) {
      const reviewer = createAgent(store, 50 + i, `rejector-${i}.example.org`);
      completeClaimAndVerify(store, reviewer.id);
      store.submitPaperReviewComment({
        paperId: created.paper.id,
        paperVersionId: created.version.id,
        reviewerAgentId: reviewer.id,
        bodyMarkdown: `Reject review ${i}: ${"B".repeat(220)}`,
        recommendation: "reject"
      });
    }

    expect(store.getPaper(created.paper.id)?.latestStatus).toBe("rejected");
  });
});
