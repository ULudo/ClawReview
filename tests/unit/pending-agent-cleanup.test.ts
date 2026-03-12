import { describe, expect, it } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";

function createPendingAgent(store: MemoryStore, handle: string) {
  const registered = store.createOrReplacePendingAgent({
    name: `Agent ${handle}`,
    handle,
    publicKey: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    endpointBaseUrl: `https://${handle}.example.org`,
    verifiedOriginDomain: `${handle}.example.org`,
    capabilities: ["publisher", "reviewer"],
    domains: ["ai-ml"],
    protocolVersion: "v1"
  });
  if ("error" in registered) throw new Error(registered.error);
  return registered.agent;
}

describe("pending agent cleanup", () => {
  it("purges stale pending agents older than retention window", () => {
    const store = new MemoryStore();
    const stale = createPendingAgent(store, "stale_pending_agent");
    const recent = createPendingAgent(store, "recent_pending_agent");

    stale.updatedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const purged = store.purgeStalePendingAgents();

    expect(purged).toContain(stale.id);
    expect(store.getAgent(stale.id)).toBeNull();
    expect(store.getAgent(recent.id)).not.toBeNull();
  });

  it("keeps multiple agents for the same human after activation", () => {
    const store = new MemoryStore();
    const first = createPendingAgent(store, "first_pending_agent");
    const second = createPendingAgent(store, "second_pending_agent");

    const started = store.startHumanEmailVerification("cleanup@example.org", "cleanup_user");
    const verified = store.verifyHumanEmailCode(started.human.email, started.verification.code);
    if ("error" in verified) throw new Error(verified.error);
    const humanId = verified.human.id;

    const firstTicket = store.createAgentClaimTicket(first.id);
    if (!firstTicket) throw new Error("expected first claim ticket");
    const firstClaim = store.fulfillAgentHumanClaim({
      claimToken: firstTicket.token,
      humanId
    });
    if ("error" in firstClaim) throw new Error(firstClaim.error);

    const secondTicket = store.createAgentClaimTicket(second.id);
    if (!secondTicket) throw new Error("expected second claim ticket");
    const secondClaim = store.fulfillAgentHumanClaim({
      claimToken: secondTicket.token,
      humanId
    });
    if ("error" in secondClaim) throw new Error(secondClaim.error);

    const secondChallenge = store.createAgentVerificationChallenge(second.id);
    const firstChallenge = store.createAgentVerificationChallenge(first.id);
    const activatedFirst = store.fulfillAgentVerification(first.id, firstChallenge.id);
    const activatedSecond = store.fulfillAgentVerification(second.id, secondChallenge.id);
    if (!activatedFirst || !activatedSecond) throw new Error("expected agent activation");

    expect(store.getAgent(first.id)?.status).toBe("active");
    expect(store.getAgent(second.id)?.status).toBe("active");
    expect(store.getAgent(first.id)).not.toBeNull();
  });
});
