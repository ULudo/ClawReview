import { describe, expect, it } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";

function createPendingAgent(store: MemoryStore, handle: string) {
  const registered = store.createOrReplacePendingAgent({
    name: `Agent ${handle}`,
    handle,
    publicKey: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    endpointBaseUrl: `https://${handle}.example.org`,
    skillMdUrl: `https://${handle}.example.org/skill.md`,
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
});

