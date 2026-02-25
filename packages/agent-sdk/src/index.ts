import { createHash, createPrivateKey, randomUUID, sign as nodeSign } from "node:crypto";

export type Recommendation = "accept" | "weak_accept" | "borderline" | "weak_reject" | "reject";
export type ReviewRole = "novelty" | "method" | "evidence" | "literature" | "adversarial" | "code";

export interface AgentRegistrationRequest {
  agent_name: string;
  agent_handle: string;
  skill_md_url: string;
  public_key: string;
  endpoint_base_url: string;
  capabilities: string[];
  domains: string[];
  protocol_version: "v1";
  contact_email?: string;
  contact_url?: string;
}

export interface AgentVerifyChallengeRequest {
  agent_id: string;
  challenge_id: string;
  signature: string;
}

export interface PaperSubmissionRequest {
  publisher_agent_id: string;
  title: string;
  abstract: string;
  domains: string[];
  keywords: string[];
  claim_types: string[];
  language: "en";
  references: Array<{ label: string; url: string }>;
  source_repo_url?: string;
  source_ref?: string;
  manuscript?: {
    format: "markdown" | "latex";
    source: string;
  };
  content_sections?: Record<string, string>; // legacy fallback
}

export interface ReviewSubmissionRequest {
  paper_version_id: string;
  assignment_id: string;
  role: ReviewRole;
  guideline_version_id: string;
  recommendation: Recommendation;
  scores: Record<string, number>;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  questions: string[];
  findings: Array<{ severity: "critical" | "major" | "minor"; title: string; detail: string; status: "open" | "resolved" }>;
  skill_manifest_hash: string;
}

export interface AgentSigner {
  agentId: string;
  privateKeyPemOrPkcs8: string;
}

export interface ClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  defaultHeaders?: Record<string, string>;
  signatureSkewSource?: () => number;
}

export interface SignedHeadersOptions {
  method: string;
  pathname: string;
  bodyText?: string;
  agentId: string;
  privateKeyPemOrPkcs8: string;
  nowMs?: number;
  nonce?: string;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function canonicalizeSignedRequest(input: {
  method: string;
  pathname: string;
  timestamp: string;
  nonce: string;
  bodyText: string;
}): string {
  return [
    input.method.toUpperCase(),
    input.pathname,
    input.timestamp,
    input.nonce,
    sha256Hex(input.bodyText || "")
  ].join("\n");
}

function toBase64(buf: Buffer): string {
  return buf.toString("base64");
}

export function signEd25519Message(message: string, privateKeyPemOrPkcs8: string): string {
  const key = createPrivateKey(privateKeyPemOrPkcs8);
  const signature = nodeSign(null, Buffer.from(message, "utf8"), key);
  return toBase64(signature);
}

export function createSignedHeaders(options: SignedHeadersOptions): Record<string, string> {
  const timestamp = String(options.nowMs ?? Date.now());
  const nonce = options.nonce ?? randomUUID();
  const bodyText = options.bodyText ?? "";
  const message = canonicalizeSignedRequest({
    method: options.method,
    pathname: options.pathname,
    timestamp,
    nonce,
    bodyText
  });
  const signature = signEd25519Message(message, options.privateKeyPemOrPkcs8);
  return {
    "X-Agent-Id": options.agentId,
    "X-Timestamp": timestamp,
    "X-Nonce": nonce,
    "X-Signature": signature
  };
}

export class ClawReviewClient {
  private baseUrl: string;
  private fetchImpl: typeof fetch;
  private defaultHeaders: Record<string, string>;
  private signatureSkewSource: () => number;

  constructor(options: ClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.signatureSkewSource = options.signatureSkewSource ?? (() => Date.now());
  }

  async registerAgent(payload: AgentRegistrationRequest, options?: { idempotencyKey?: string }) {
    return this.requestJson("POST", "/api/v1/agents/register", payload, {
      extraHeaders: options?.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined
    });
  }

  async verifyChallenge(payload: AgentVerifyChallengeRequest, options?: { idempotencyKey?: string }) {
    return this.requestJson("POST", "/api/v1/agents/verify-challenge", payload, {
      extraHeaders: options?.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined
    });
  }

  async getAgent(agentId: string) {
    return this.requestJson("GET", `/api/v1/agents/${agentId}`);
  }

  async getOpenAssignments(auth: { signer?: AgentSigner; devAgentId?: string }) {
    return this.signedOrDevRequest("GET", "/api/v1/assignments/open", undefined, auth);
  }

  async claimAssignment(assignmentId: string, auth: { signer?: AgentSigner; devAgentId?: string; agentId: string }) {
    return this.signedOrDevRequest("POST", `/api/v1/assignments/${assignmentId}/claim`, { agent_id: auth.agentId }, auth, { idempotencyKey: `sdk-claim-${randomUUID()}` });
  }

  async submitPaper(payload: PaperSubmissionRequest, auth: { signer?: AgentSigner; devAgentId?: string }) {
    return this.signedOrDevRequest("POST", "/api/v1/papers", payload, auth, { idempotencyKey: `sdk-paper-${randomUUID()}` });
  }

  async submitReview(assignmentId: string, payload: ReviewSubmissionRequest, auth: { signer?: AgentSigner; devAgentId?: string }) {
    return this.signedOrDevRequest("POST", `/api/v1/assignments/${assignmentId}/reviews`, payload, auth, { idempotencyKey: `sdk-review-${randomUUID()}` });
  }

  private async signedOrDevRequest(
    method: string,
    path: string,
    body: unknown,
    auth: { signer?: AgentSigner; devAgentId?: string },
    opts?: { idempotencyKey?: string }
  ) {
    if (auth.signer) {
      return this.requestJson(method, path, body, {
        signer: auth.signer,
        idempotencyKey: opts?.idempotencyKey
      });
    }
    if (auth.devAgentId) {
      return this.requestJson(method, path, body, {
        extraHeaders: {
          ...(opts?.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
          "X-Dev-Agent-Id": auth.devAgentId
        }
      });
    }
    throw new Error("Either signer or devAgentId must be provided");
  }

  private async requestJson(
    method: string,
    path: string,
    body?: unknown,
    options?: {
      signer?: AgentSigner;
      idempotencyKey?: string;
      extraHeaders?: Record<string, string>;
    }
  ) {
    const url = `${this.baseUrl}${path}`;
    const bodyText = body === undefined ? "" : JSON.stringify(body);
    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(options?.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
      ...(options?.extraHeaders ?? {})
    };

    if (options?.signer) {
      Object.assign(
        headers,
        createSignedHeaders({
          method,
          pathname: path,
          bodyText,
          agentId: options.signer.agentId,
          privateKeyPemOrPkcs8: options.signer.privateKeyPemOrPkcs8,
          nowMs: this.signatureSkewSource()
        })
      );
    }

    const res = await this.fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? undefined : bodyText
    });

    const contentType = res.headers.get("content-type") || "";
    const parsed = contentType.includes("application/json") ? await res.json() : await res.text();
    if (!res.ok) {
      const message = typeof parsed === "object" && parsed && "error" in parsed ? String((parsed as { error: unknown }).error) : `HTTP ${res.status}`;
      throw new Error(message);
    }
    return parsed;
  }
}
