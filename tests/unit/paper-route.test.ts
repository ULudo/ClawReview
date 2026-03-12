import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { sha256Hex } from "@/lib/utils";

type RouteModule = typeof import("../../src/app/api/v1/[...path]/route");
type RuntimeModule = typeof import("../../src/lib/store/runtime");

function createRequest(url: string, init?: RequestInit) {
  return new NextRequest(url, init);
}

async function loadModules(): Promise<{ route: RouteModule; runtime: RuntimeModule }> {
  const runtime = await import("../../src/lib/store/runtime");
  const route = await import("../../src/app/api/v1/[...path]/route");
  return { route, runtime };
}

async function createActiveAgent(runtime: RuntimeModule, index: number) {
  const store = await runtime.getRuntimeStore();
  const registered = store.createOrReplacePendingAgent({
    name: `Agent ${index}`,
    handle: `agent_route_${index}`,
    publicKey: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    endpointBaseUrl: `https://agent-route-${index}.example.org`,
    verifiedOriginDomain: `agent-route-${index}.example.org`,
    capabilities: ["publisher", "reviewer"],
    domains: ["ai-ml"],
    protocolVersion: "v1"
  });
  if ("error" in registered) throw new Error(registered.error);

  const humanStart = store.startHumanEmailVerification(`route-${index}@example.org`, `route_human_${index}`);
  const verified = store.verifyHumanEmailCode(humanStart.human.email, humanStart.verification.code);
  if ("error" in verified) throw new Error(verified.error);
  const github = store.linkHumanGithub(verified.human.id, `route-gh-${index}`, `route_gh_${index}`);
  if ("error" in github) throw new Error(github.error);

  const ticket = store.createAgentClaimTicket(registered.agent.id);
  if (!ticket) throw new Error("missing claim ticket");
  store.fulfillAgentHumanClaim({ claimToken: ticket.token, humanId: verified.human.id });
  const challenge = store.createAgentVerificationChallenge(registered.agent.id);
  store.fulfillAgentVerification(registered.agent.id, challenge.id);
  return registered.agent;
}

const longText = "This section contains enough scientific prose to satisfy the current markdown validator. ".repeat(18);

const validManuscript = `# Route Test Paper

## Introduction
${longText}

## Literature Review
${longText}

## Problem Statement
${longText}

## Method
${longText}

## Evaluation
${longText}

## Conclusion
${longText}
`;

describe("paper and asset routes", () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env.ALLOW_UNSIGNED_DEV = "true";
    const runtime = await import("../../src/lib/store/runtime");
    await runtime.clearRuntimeStateForTests();
  });

  it("rejects manuscript asset references that are missing from attachment_asset_ids", async () => {
    const { route, runtime } = await loadModules();
    const agent = await createActiveAgent(runtime, 1);

    const req = createRequest("http://localhost:3000/api/v1/papers", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-dev-agent-id": agent.id
      },
      body: JSON.stringify({
        publisher_agent_id: agent.id,
        title: "A Structured Test Paper",
        abstract: "This abstract is intentionally longer than eighty characters so that the validation passes correctly.",
        domains: ["ai-ml"],
        keywords: ["agents"],
        claim_types: ["theory"],
        language: "en",
        references: [],
        manuscript: {
          format: "markdown",
          source: `${validManuscript}\n![Figure 1](asset:asset_missing)\n`
        }
      })
    });

    const res = await route.POST(req);
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error_code).toBe("PAPER_ATTACHMENT_REFERENCE_INVALID");
  });

  it("serves completed asset content from the public content endpoint", async () => {
    const { route, runtime } = await loadModules();
    const agent = await createActiveAgent(runtime, 2);
    const store = await runtime.getRuntimeStore();
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
      0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
      0x42, 0x60, 0x82
    ]);

    const asset = store.createAssetUploadIntent({
      ownerAgentId: agent.id,
      filename: "figure.png",
      contentType: "image/png",
      byteSize: pngBytes.byteLength,
      sha256: sha256Hex(pngBytes)
    });
    store.uploadAssetBinary({ assetId: asset.id, uploadToken: asset.uploadToken, bytes: pngBytes });
    store.completeAssetUpload({ assetId: asset.id, ownerAgentId: agent.id });

    const req = createRequest(`http://localhost:3000/api/v1/assets/${asset.id}/content`);
    const res = await route.GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(Buffer.from(pngBytes));
  });
});
