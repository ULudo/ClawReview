import { describe, expect, it } from "vitest";
import { REVIEWS_REQUIRED_PER_SUBMISSION } from "../../src/lib/constants";
import { MemoryStore } from "../../src/lib/store/memory";

function createActiveAgent(store: MemoryStore, index: number) {
  const registered = store.createOrReplacePendingAgent({
    name: `Agent ${index}`,
    handle: `agent_${index}`,
    publicKey: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    endpointBaseUrl: `https://agent-${index}.example.org`,
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

function createClaimedAgentForHuman(store: MemoryStore, humanId: string, index: number) {
  const registered = store.createOrReplacePendingAgent({
    name: `Agent ${index}`,
    handle: `agent_${index}`,
    publicKey: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    endpointBaseUrl: `https://agent-${index}.example.org`,
    verifiedOriginDomain: `agent-${index}.example.org`,
    capabilities: ["publisher", "reviewer"],
    domains: ["ai-ml"],
    protocolVersion: "v1"
  });
  if ("error" in registered) throw new Error(registered.error);
  const ticket = store.createAgentClaimTicket(registered.agent.id);
  if (!ticket) throw new Error("missing claim ticket");
  store.fulfillAgentHumanClaim({ claimToken: ticket.token, humanId });
  const challenge = store.createAgentVerificationChallenge(registered.agent.id);
  store.fulfillAgentVerification(registered.agent.id, challenge.id);
  return registered.agent;
}

function submitPaperForAgent(store: MemoryStore, agentId: string, index: number) {
  const agent = store.getAgent(agentId);
  if (!agent?.ownerHumanId) throw new Error("missing owner human");
  const gate = store.getSubmissionGateForAgent(agentId);
  return store.createPaperWithVersion({
    publisherAgentId: agentId,
    publisherHumanId: agent.ownerHumanId,
    title: `Paper ${index}`,
    abstract: "A sufficiently long abstract for submission gate testing.",
    domains: ["ai-ml"],
    keywords: ["test"],
    claimTypes: ["theory"],
    language: "en",
    references: [],
    contentSections: { markdown_source: "content" },
    manuscriptFormat: "markdown",
    manuscriptSource: "S".repeat(1800),
    attachmentAssetIds: [],
    submissionReviewRequirement: gate?.nextSubmissionReviewRequirement ?? REVIEWS_REQUIRED_PER_SUBMISSION,
    submissionReviewRequirementBypassed: (gate?.nextSubmissionReviewRequirement ?? REVIEWS_REQUIRED_PER_SUBMISSION) === 0
  });
}

describe("submission review gate", () => {
  it("requires two reviews before the same user can submit again", () => {
    const store = new MemoryStore();
    const externalA = createActiveAgent(store, 1);
    const externalB = createActiveAgent(store, 2);
    const author = createActiveAgent(store, 3);

    submitPaperForAgent(store, externalA.id, 1);
    submitPaperForAgent(store, externalB.id, 2);
    submitPaperForAgent(store, author.id, 3);

    const gate = store.getSubmissionGateForAgent(author.id);
    expect(gate?.requiredReviewCount).toBe(2);
    expect(gate?.completedReviewCount).toBe(0);
    expect(gate?.outstandingReviewCount).toBe(2);
    expect(gate?.blocked).toBe(true);
  });

  it("allows any sibling agent under the same user to satisfy the review requirement", () => {
    const store = new MemoryStore();
    const externalA = createActiveAgent(store, 10);
    const externalB = createActiveAgent(store, 11);
    const author = createActiveAgent(store, 12);
    const authorHumanId = store.getAgent(author.id)?.ownerHumanId;
    if (!authorHumanId) throw new Error("missing owner human");
    const sibling = createClaimedAgentForHuman(store, authorHumanId, 13);

    const paperA = submitPaperForAgent(store, externalA.id, 10);
    const paperB = submitPaperForAgent(store, externalB.id, 11);
    submitPaperForAgent(store, author.id, 12);

    const firstReview = store.submitPaperReviewComment({
      paperId: paperA.paper.id,
      paperVersionId: paperA.version.id,
      reviewerAgentId: author.id,
      bodyMarkdown: "T".repeat(220),
      recommendation: "accept"
    });
    expect("error" in firstReview).toBe(false);

    const secondReview = store.submitPaperReviewComment({
      paperId: paperB.paper.id,
      paperVersionId: paperB.version.id,
      reviewerAgentId: sibling.id,
      bodyMarkdown: "U".repeat(220),
      recommendation: "accept"
    });
    expect("error" in secondReview).toBe(false);

    const gate = store.getSubmissionGateForAgent(author.id);
    expect(gate?.outstandingReviewCount).toBe(0);
    expect(gate?.blocked).toBe(false);
  });

  it("does not let old reviews pre-pay future submission requirements", () => {
    const store = new MemoryStore();
    const externalA = createActiveAgent(store, 30);
    const externalB = createActiveAgent(store, 31);
    const externalC = createActiveAgent(store, 33);
    const externalD = createActiveAgent(store, 34);
    const author = createActiveAgent(store, 32);

    const paperA = submitPaperForAgent(store, externalA.id, 30);
    const paperB = submitPaperForAgent(store, externalB.id, 31);
    submitPaperForAgent(store, externalC.id, 33);
    submitPaperForAgent(store, externalD.id, 34);

    const firstReview = store.submitPaperReviewComment({
      paperId: paperA.paper.id,
      paperVersionId: paperA.version.id,
      reviewerAgentId: author.id,
      bodyMarkdown: "W".repeat(220),
      recommendation: "accept"
    });
    expect("error" in firstReview).toBe(false);

    const secondReview = store.submitPaperReviewComment({
      paperId: paperB.paper.id,
      paperVersionId: paperB.version.id,
      reviewerAgentId: author.id,
      bodyMarkdown: "X".repeat(220),
      recommendation: "accept"
    });
    expect("error" in secondReview).toBe(false);

    submitPaperForAgent(store, author.id, 32);

    const gate = store.getSubmissionGateForAgent(author.id);
    expect(gate?.completedReviewCount).toBe(2);
    expect(gate?.outstandingReviewCount).toBe(2);
    expect(gate?.blocked).toBe(true);
  });

  it("allows bypass when the submitting agent has no eligible reviews left", () => {
    const store = new MemoryStore();
    const external = createActiveAgent(store, 20);
    const author = createActiveAgent(store, 21);

    const externalPaper = submitPaperForAgent(store, external.id, 20);
    submitPaperForAgent(store, author.id, 21);

    const review = store.submitPaperReviewComment({
      paperId: externalPaper.paper.id,
      paperVersionId: externalPaper.version.id,
      reviewerAgentId: author.id,
      bodyMarkdown: "V".repeat(220),
      recommendation: "accept"
    });
    expect("error" in review).toBe(false);

    const gate = store.getSubmissionGateForAgent(author.id);
    expect(gate?.outstandingReviewCount).toBe(1);
    expect(gate?.eligibleReviewCount).toBe(0);
    expect(gate?.bypassAllowed).toBe(true);
    expect(gate?.blocked).toBe(false);
    expect(gate?.nextSubmissionReviewRequirement).toBe(0);
  });
});
