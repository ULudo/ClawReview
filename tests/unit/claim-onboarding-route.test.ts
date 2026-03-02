import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const sendVerificationEmailMock = vi.fn();

vi.mock("@/lib/email/send-verification-email", () => ({
  sendVerificationEmail: sendVerificationEmailMock
}));

type RouteModule = typeof import("../../src/app/api/v1/[...path]/route");
type RuntimeModule = typeof import("../../src/lib/store/runtime");

async function loadModules(): Promise<{ route: RouteModule; runtime: RuntimeModule }> {
  const runtime = await import("../../src/lib/store/runtime");
  const route = await import("../../src/app/api/v1/[...path]/route");
  return { route, runtime };
}

function createRequest(url: string, init?: RequestInit) {
  return new NextRequest(url, init);
}

describe("claim onboarding api", () => {
  beforeEach(async () => {
    vi.resetModules();
    sendVerificationEmailMock.mockReset();
    process.env.ALLOW_UNSIGNED_DEV = "true";
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    const runtime = await import("../../src/lib/store/runtime");
    await runtime.clearRuntimeStateForTests();
  });

  it("returns CLAIM_TOKEN_INVALID for unknown claim token", async () => {
    const { route } = await loadModules();
    const req = createRequest("http://localhost:3000/api/v1/agents/claim/claimtok_missing");
    const res = await route.GET(req);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error_code).toBe("CLAIM_TOKEN_INVALID");
  });

  it("returns CLAIM_TOKEN_EXPIRED for expired claim token", async () => {
    const { route, runtime } = await loadModules();
    const store = await runtime.getRuntimeStore();
    const registered = store.createOrReplacePendingAgent({
      name: "Agent One",
      handle: "agent_one",
      publicKey: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      endpointBaseUrl: "https://agent-one.example.org",
      skillMdUrl: "https://agent-one.example.org/skill.md",
      verifiedOriginDomain: "agent-one.example.org",
      capabilities: ["publisher", "reviewer"],
      domains: ["ai-ml"],
      protocolVersion: "v1"
    });
    if ("error" in registered) throw new Error(registered.error);
    const ticket = store.createAgentClaimTicket(registered.agent.id);
    if (!ticket) throw new Error("expected claim ticket");
    ticket.expiresAt = new Date(Date.now() - 60_000).toISOString();

    const req = createRequest(`http://localhost:3000/api/v1/agents/claim/${encodeURIComponent(ticket.token)}`);
    const res = await route.GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error_code).toBe("CLAIM_TOKEN_EXPIRED");
  });

  it("redirects github callback to claim page in redirect mode", async () => {
    const { route, runtime } = await loadModules();
    const store = await runtime.getRuntimeStore();
    const started = store.startHumanEmailVerification("person@example.org", "person");
    const verified = store.verifyHumanEmailCode(started.human.email, started.verification.code);
    if ("error" in verified) throw new Error(verified.error);
    const sessionToken = verified.session.token;

    const startReq = createRequest("http://localhost:3000/api/v1/humans/auth/github/start?response_mode=redirect&return_to=%2Fclaim%2Fclaimtok_test", {
      headers: { cookie: `clawreview_human_session=${sessionToken}` }
    });
    const startRes = await route.GET(startReq);
    const startBody = await startRes.json();
    expect(startRes.status).toBe(200);
    const authorizationUrl = startBody.authorization_url as string;
    expect(authorizationUrl).toContain("/api/v1/humans/auth/github/callback");

    const callbackReq = createRequest(authorizationUrl);
    const callbackRes = await route.GET(callbackReq);
    expect(callbackRes.status).toBe(302);
    expect(callbackRes.headers.get("location")).toBe("http://localhost:3000/claim/claimtok_test");
  });

  it("keeps json callback mode for compatibility", async () => {
    const { route, runtime } = await loadModules();
    const store = await runtime.getRuntimeStore();
    const started = store.startHumanEmailVerification("json@example.org", "json_user");
    const verified = store.verifyHumanEmailCode(started.human.email, started.verification.code);
    if ("error" in verified) throw new Error(verified.error);
    const sessionToken = verified.session.token;

    const startReq = createRequest("http://localhost:3000/api/v1/humans/auth/github/start", {
      headers: { cookie: `clawreview_human_session=${sessionToken}` }
    });
    const startRes = await route.GET(startReq);
    const startBody = await startRes.json();
    expect(startRes.status).toBe(200);
    const authorizationUrl = startBody.authorization_url as string;

    const callbackReq = createRequest(authorizationUrl);
    const callbackRes = await route.GET(callbackReq);
    const callbackBody = await callbackRes.json();
    expect(callbackRes.status).toBe(200);
    expect(callbackBody.github_linked).toBe(true);
  });

  it("returns delivery=email when verification email succeeds", async () => {
    process.env.ALLOW_UNSIGNED_DEV = "false";
    sendVerificationEmailMock.mockResolvedValue({ ok: true });
    const { route } = await loadModules();
    const req = createRequest("http://localhost:3000/api/v1/humans/auth/start-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "deliver@example.org", username: "deliver_user" })
    });
    const res = await route.POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.delivery).toBe("email");
    expect(sendVerificationEmailMock).toHaveBeenCalledTimes(1);
  });

  it("hard fails when email delivery is unavailable in production mode", async () => {
    process.env.ALLOW_UNSIGNED_DEV = "false";
    sendVerificationEmailMock.mockResolvedValue({ ok: false, error: "missing key" });
    const { route } = await loadModules();
    const req = createRequest("http://localhost:3000/api/v1/humans/auth/start-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "fail@example.org", username: "fail_user" })
    });
    const res = await route.POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error_code).toBe("INTERNAL_ERROR");
  });
});

