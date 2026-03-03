import { randomUUID, generateKeyPairSync, sign } from "node:crypto";

type AgentFixture = {
  index: number;
  name: string;
  handle: string;
  publicKeyHex: string;
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"];
  agentId?: string;
};

type RegisterResponse = {
  agent: { id: string; handle: string };
  challenge: { id: string; message: string; expiresAt: string };
  claim: { claimUrl: string; expiresAt: string };
};

type StartEmailResponse = {
  verification_code_dev_only?: string;
};

type GithubStartResponse = {
  authorization_url: string;
};

type PaperCreateResponse = {
  paper: { id: string; latestStatus: string };
  version: { id: string };
};

function parseArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const raw = process.argv.find((value) => value.startsWith(prefix));
  if (!raw) return fallback;
  return raw.slice(prefix.length);
}

function base64UrlToBuffer(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<{ status: number; body: T; headers: Headers }> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body, headers: res.headers };
}

function parseSessionCookie(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/clawreview_human_session=([^;]+)/);
  return match?.[1] ?? null;
}

function mustOk(status: number, body: unknown, context: string) {
  if (status >= 200 && status < 300) return;
  throw new Error(`${context} failed (${status}): ${JSON.stringify(body)}`);
}

function manuscriptSource(seed: string) {
  const fill = (title: string) => `## ${title}\n\n${seed} ${"x".repeat(260)}\n\n`;
  return [
    "# Simulated Paper",
    "",
    fill("Introduction"),
    fill("Literature Review"),
    fill("Problem Statement"),
    fill("Method"),
    fill("Evaluation"),
    fill("Conclusion")
  ].join("\n");
}

function reviewBody(index: number) {
  return `Review ${index}: ${"evidence ".repeat(35)}`.trim();
}

function recommendationPlan(scenario: "accept" | "revision" | "reject"): Array<"accept" | "reject"> {
  if (scenario === "accept") {
    return ["accept", "accept", "accept", "accept", "accept", "accept", "accept", "accept", "accept", "reject"];
  }
  if (scenario === "revision") {
    return ["accept", "accept", "accept", "accept", "accept", "accept", "reject", "reject", "reject", "reject"];
  }
  return ["reject", "reject", "reject", "reject", "reject", "accept", "accept", "accept", "accept", "accept"];
}

async function run() {
  const apiBase = parseArg("api-base", "http://localhost:3001/api/v1");
  const scenarioRaw = parseArg("scenario", "revision");
  const scenario = (["accept", "revision", "reject"].includes(scenarioRaw) ? scenarioRaw : "revision") as "accept" | "revision" | "reject";

  console.log(`Simulating flow against ${apiBase} (scenario=${scenario})`);
  console.log("Prerequisite: local app started with ALLOW_UNSIGNED_DEV=true");

  const agents: AgentFixture[] = Array.from({ length: 11 }, (_, i) => {
    const index = i + 1;
    const pair = generateKeyPairSync("ed25519");
    const publicJwk = pair.publicKey.export({ format: "jwk" }) as JsonWebKey;
    if (!publicJwk.x) {
      throw new Error("Failed to export Ed25519 public key as JWK");
    }
    const publicKeyHex = base64UrlToBuffer(publicJwk.x).toString("hex");
    return {
      index,
      name: `Sim Agent ${index}`,
      handle: `sim_agent_${index}_${randomUUID().slice(0, 8)}`,
      publicKeyHex,
      privateKey: pair.privateKey,
    };
  });

  for (const agent of agents) {
      const register = await fetchJson<RegisterResponse>(`${apiBase}/agents/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agent_name: agent.name,
          agent_handle: agent.handle,
          public_key: agent.publicKeyHex,
          endpoint_base_url: `https://sim.local/${agent.handle}`,
          domains: ["ai-ml"]
        })
      });
      mustOk(register.status, register.body, `register(${agent.handle})`);
      agent.agentId = register.body.agent.id;

      const email = `sim-human-${agent.index}-${randomUUID().slice(0, 6)}@example.test`;
      const username = `sim_human_${agent.index}_${randomUUID().slice(0, 6)}`;
      const startEmail = await fetchJson<StartEmailResponse>(`${apiBase}/humans/auth/start-email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, username })
      });
      mustOk(startEmail.status, startEmail.body, `start-email(${agent.handle})`);
      const code = startEmail.body.verification_code_dev_only;
      if (!code) {
        throw new Error(`Missing verification_code_dev_only for ${agent.handle}. Ensure ALLOW_UNSIGNED_DEV=true.`);
      }

      const verifyEmail = await fetchJson<Record<string, unknown>>(`${apiBase}/humans/auth/verify-email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code })
      });
      mustOk(verifyEmail.status, verifyEmail.body, `verify-email(${agent.handle})`);
      const sessionToken = parseSessionCookie(verifyEmail.headers.get("set-cookie"));
      if (!sessionToken) {
        throw new Error(`Missing human session cookie for ${agent.handle}`);
      }
      const cookieHeader = `clawreview_human_session=${sessionToken}`;

      const ghStart = await fetchJson<GithubStartResponse>(`${apiBase}/humans/auth/github/start`, {
        headers: { cookie: cookieHeader }
      });
      mustOk(ghStart.status, ghStart.body, `github-start(${agent.handle})`);
      const authUrl = new URL(ghStart.body.authorization_url);
      const state = authUrl.searchParams.get("state");
      if (!state) throw new Error(`Missing GitHub state for ${agent.handle}`);

      const ghCallbackUrl = `${apiBase}/humans/auth/github/callback?state=${encodeURIComponent(state)}&mock_id=gh_${agent.index}_${randomUUID().slice(0, 6)}&mock_login=${encodeURIComponent(`simgh_${agent.index}`)}`;
      const ghCallback = await fetchJson<Record<string, unknown>>(ghCallbackUrl, {
        headers: { cookie: cookieHeader }
      });
      mustOk(ghCallback.status, ghCallback.body, `github-callback(${agent.handle})`);

      const claimToken = register.body.claim.claimUrl.split("/claim/")[1];
      if (!claimToken) throw new Error(`Invalid claim URL for ${agent.handle}`);
      const claim = await fetchJson<Record<string, unknown>>(`${apiBase}/agents/claim`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: cookieHeader },
        body: JSON.stringify({
          claim_token: claimToken,
          accept_terms: true,
          accept_content_policy: true
        })
      });
      mustOk(claim.status, claim.body, `claim(${agent.handle})`);

      const signature = sign(null, Buffer.from(register.body.challenge.message, "utf8"), agent.privateKey).toString("base64");
      const verify = await fetchJson<Record<string, unknown>>(`${apiBase}/agents/verify-challenge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agent_id: register.body.agent.id,
          challenge_id: register.body.challenge.id,
          signature
        })
      });
      mustOk(verify.status, verify.body, `verify-challenge(${agent.handle})`);
      console.log(`Agent active: ${agent.handle} (${agent.agentId})`);
    }

    const publisher = agents[0];
    if (!publisher.agentId) throw new Error("Publisher agent is missing");
    const publish = await fetchJson<PaperCreateResponse>(`${apiBase}/papers`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-dev-agent-id": publisher.agentId
      },
      body: JSON.stringify({
        publisher_agent_id: publisher.agentId,
        title: `Simulation Paper (${scenario})`,
        abstract: "This is an automated simulation paper used to test full registration, claim, verification, publishing, and review lifecycle.",
        domains: ["ai-ml"],
        keywords: ["simulation", "local-test"],
        claim_types: ["theory"],
        language: "en",
        references: [],
        manuscript: {
          format: "markdown",
          source: manuscriptSource(`Scenario ${scenario}`)
        }
      })
    });
    mustOk(publish.status, publish.body, "publish-paper");
    const paperId = publish.body.paper.id;
    const paperVersionId = publish.body.version.id;
    console.log(`Paper published: ${paperId} (version ${paperVersionId})`);

    const plan = recommendationPlan(scenario);
    for (let i = 1; i <= 10; i += 1) {
      const reviewer = agents[i];
      if (!reviewer.agentId) throw new Error(`Reviewer ${i} missing agent id`);
      const recommendation = plan[i - 1];
      const review = await fetchJson<Record<string, unknown>>(`${apiBase}/papers/${paperId}/reviews`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-dev-agent-id": reviewer.agentId
        },
        body: JSON.stringify({
          paper_version_id: paperVersionId,
          body_markdown: reviewBody(i),
          recommendation
        })
      });
      mustOk(review.status, review.body, `submit-review(${reviewer.handle})`);
      console.log(`Review ${i}/10 submitted (${recommendation}) by ${reviewer.handle}`);
    }

  const paperView = await fetchJson<{ paper: { latestStatus: string } }>(`${apiBase}/papers/${paperId}`);
  mustOk(paperView.status, paperView.body, "fetch-paper");
  console.log(`Final status: ${paperView.body.paper.latestStatus}`);
  console.log("Simulation completed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
