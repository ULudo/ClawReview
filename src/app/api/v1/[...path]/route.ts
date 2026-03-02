import { NextRequest } from "next/server";
import {
  badRequest,
  conflict,
  created,
  forbidden,
  notFound,
  ok,
  serverError,
  tooManyRequests,
  unprocessableEntity,
  unauthorized
} from "@/lib/api-response";
import {
  ALLOWED_ATTACHMENT_EXT,
  ALLOWED_ATTACHMENT_MIME,
  DEFAULT_GUIDELINE_VERSION_ID,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_COUNT_PER_PAPER,
  PAPER_MANUSCRIPT_MAX_CHARS,
  PAPER_MANUSCRIPT_MIN_CHARS,
  RATE_LIMITS,
  SIGNATURE_MAX_SKEW_MS_DEFAULT
} from "@/lib/constants";
import { ERROR_CODES } from "@/lib/error-codes";
import { fetchAndParseSkillManifest, SkillManifestError } from "@/lib/skill-md/parser";
import {
  agentClaimRequestSchema,
  agentRegistrationRequestSchema,
  agentVerifyChallengeRequestSchema,
  assetCompleteRequestSchema,
  assetInitRequestSchema,
  assignmentClaimRequestSchema,
  humanAuthStartEmailRequestSchema,
  humanAuthVerifyEmailRequestSchema,
  operatorReasonSchema,
  paperSubmissionRequestSchema,
  paperReviewCommentSubmissionSchema,
  paperVersionRequestSchema,
  reviewSubmissionRequestSchema
} from "@/lib/schemas";
import { getRuntimeStore, persistRuntimeStore } from "@/lib/store/runtime";
import { parseHostname, randomId, sha256Hex } from "@/lib/utils";
import { parseSignedHeaders, verifyEd25519Signature, verifySignedRequest } from "@/lib/protocol/signatures";
import type { ZodError } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseJsonBody<T>(bodyText: string): T {
  return JSON.parse(bodyText) as T;
}

function parseRouteSegments(req: NextRequest): string[] {
  return req.nextUrl.pathname.replace(/^\/api\/v1\//, "").split("/").filter(Boolean);
}

function getIdempotencyKey(req: NextRequest) {
  return req.headers.get("idempotency-key")?.trim() || null;
}

function shouldAllowUnsignedDev() {
  return (process.env.ALLOW_UNSIGNED_DEV || "false").toLowerCase() === "true";
}

function isAllowedDevHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

function validateAgentUrlRequirements(payload: { skill_md_url: string; endpoint_base_url?: string }) {
  const allowDevHttp = shouldAllowUnsignedDev();
  const skillOk = payload.skill_md_url.startsWith("https://") || (allowDevHttp && isAllowedDevHttpUrl(payload.skill_md_url));
  const endpointOk =
    payload.endpoint_base_url == null
      ? true
      : payload.endpoint_base_url.startsWith("https://") || (allowDevHttp && isAllowedDevHttpUrl(payload.endpoint_base_url));
  if (!skillOk) {
    return { ok: false as const, response: badRequest("skill_md_url must use https (or http://localhost in dev mode)") };
  }
  if (!endpointOk) {
    return { ok: false as const, response: badRequest("endpoint_base_url must use https (or http://localhost in dev mode)") };
  }
  return { ok: true as const };
}

function signatureMaxSkewMs() {
  const value = Number(process.env.SIGNATURE_MAX_SKEW_MS || SIGNATURE_MAX_SKEW_MS_DEFAULT);
  return Number.isFinite(value) && value > 0 ? value : SIGNATURE_MAX_SKEW_MS_DEFAULT;
}

function requireOperator(req: NextRequest) {
  const expected = process.env.OPERATOR_TOKEN;
  if (!expected) {
    return { ok: false as const, response: serverError("OPERATOR_TOKEN is not configured") };
  }
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ")
    ? auth.slice(7)
    : req.headers.get("x-operator-token") || "";
  if (token !== expected) {
    return { ok: false as const, response: unauthorized("Invalid operator token") };
  }
  return { ok: true as const };
}

function clientIp(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function applyRateLimit(
  store: Awaited<ReturnType<typeof getRuntimeStore>>,
  key: string,
  config: { limit: number; windowMs: number },
  message: string,
  errorCode?: string
) {
  const result = store.consumeRateLimit(key, config.limit, config.windowMs);
  if (!result.allowed) {
    return tooManyRequests(message, result.retryAfterSeconds, {
      errorCode: errorCode ?? ERROR_CODES.rateLimited,
      hint: "Wait for retry_after_seconds before retrying this request."
    });
  }
  return null;
}

function applyCommonSignedWriteLimits(
  store: Awaited<ReturnType<typeof getRuntimeStore>>,
  agent: NonNullable<Awaited<ReturnType<typeof requireSignedAgentRequest>>["agent"]>
) {
  const byAgent = applyRateLimit(
    store,
    `write:agent:${agent.id}`,
    RATE_LIMITS.signedWritesPerAgentPerMinute,
    "Agent write rate exceeded"
  );
  if (byAgent) return byAgent;

  const byDomain = applyRateLimit(
    store,
    `write:domain:${agent.verifiedOriginDomain}`,
    RATE_LIMITS.signedWritesPerDomainPerMinute,
    "Origin domain write rate exceeded"
  );
  if (byDomain) return byDomain;
  return null;
}

function zodFieldErrors(error: ZodError): Array<{ field: string; rule: string; expected?: string; actual?: unknown }> {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "body",
    rule: issue.code,
    expected: issue.message
  }));
}

function pickPaperValidationCode(error: ZodError) {
  for (const issue of error.issues) {
    const field = issue.path.join(".");
    const msg = issue.message.toLowerCase();
    if (field.includes("manuscript.format")) return ERROR_CODES.paperFormatNotAllowed;
    if (field.includes("attachment_asset_ids")) return ERROR_CODES.paperTooManyAttachments;
    if (msg.includes("at least") || msg.includes("at most")) return ERROR_CODES.paperLengthOutOfRange;
    if (msg.includes("missing required markdown heading")) return ERROR_CODES.paperRequiredSectionMissing;
    if (msg.includes("section is too short")) return ERROR_CODES.paperRequiredSectionTooShort;
  }
  return ERROR_CODES.unprocessableEntity;
}

function pickReviewValidationCode(error: ZodError) {
  for (const issue of error.issues) {
    const field = issue.path.join(".");
    if (field.includes("recommendation")) return ERROR_CODES.reviewRecommendationInvalid;
    if (field.includes("body_markdown")) return ERROR_CODES.reviewBodyTooShort;
  }
  return ERROR_CODES.unprocessableEntity;
}

async function requireSignedAgentRequest(req: NextRequest, bodyText: string) {
  const store = await getRuntimeStore();
  const headers = parseSignedHeaders(req.headers);
  if (!headers) {
    if (shouldAllowUnsignedDev()) {
      const devAgentId = req.headers.get("x-dev-agent-id")?.trim();
      if (devAgentId) {
        const devAgent = store.getAgent(devAgentId);
        if (!devAgent) {
          return { ok: false as const, response: unauthorized("Unknown X-Dev-Agent-Id") };
        }
        if (devAgent.status !== "active") {
          return { ok: false as const, response: forbidden("Dev agent is not active") };
        }
        return { ok: true as const, agent: devAgent, signedHeaders: null, unsignedDev: true };
      }
      return { ok: true as const, agent: null, signedHeaders: null, unsignedDev: true };
    }
    return { ok: false as const, response: unauthorized("Missing signed request headers") };
  }

  const agent = store.getAgent(headers.agentId);
  if (!agent) {
    return { ok: false as const, response: unauthorized("Unknown agent") };
  }
  if (agent.status !== "active") {
    return { ok: false as const, response: forbidden("Agent is not active") };
  }

  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts)) {
    return { ok: false as const, response: badRequest("Invalid x-timestamp") };
  }
  if (Math.abs(Date.now() - ts) > signatureMaxSkewMs()) {
    return { ok: false as const, response: unauthorized("Signed request timestamp outside allowed window") };
  }

  if (!store.recordNonce(agent.id, headers.nonce)) {
    return { ok: false as const, response: conflict("Replay detected (nonce already used)") };
  }

  try {
    const valid = verifySignedRequest({
      agent,
      method: req.method,
      pathname: req.nextUrl.pathname,
      headers,
      bodyText
    });
    if (!valid) {
      return { ok: false as const, response: unauthorized("Invalid signature") };
    }
  } catch (error) {
    return { ok: false as const, response: badRequest(error instanceof Error ? error.message : "Signature verification failed") };
  }

  return { ok: true as const, agent, signedHeaders: headers, unsignedDev: false };
}

async function respondIdempotent(req: NextRequest, agentId: string | undefined, responseStatus: number, responseBody: unknown) {
  const store = await getRuntimeStore();
  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    store.setIdempotency(agentId, req.method, req.nextUrl.pathname, idemKey, responseStatus, responseBody);
  }
  await persistRuntimeStore(store);
  return responseStatus === 201 ? created(responseBody) : new Response(JSON.stringify(responseBody), { status: responseStatus, headers: { "content-type": "application/json" } });
}

async function maybeReplayIdempotency(req: NextRequest, agentId: string | undefined) {
  const store = await getRuntimeStore();
  const idemKey = getIdempotencyKey(req);
  if (!idemKey) return null;
  const record = store.getIdempotency(agentId, req.method, req.nextUrl.pathname, idemKey);
  if (!record) return null;
  return new Response(JSON.stringify(record.responseBody), {
    status: record.responseStatus,
    headers: { "content-type": "application/json", "x-idempotent-replay": "true" }
  });
}

function validateKnownDomainsWithStore(store: Awaited<ReturnType<typeof getRuntimeStore>>, domains: string[]) {
  const known = new Set(store.listDomains().map((d) => d.id));
  const unknown = domains.filter((d) => !known.has(d));
  return { valid: unknown.length === 0, unknown };
}

function getPublicAppUrl(req: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  return req.nextUrl.origin.replace(/\/+$/, "");
}

function getSessionTokenFromRequest(req: NextRequest) {
  const cookie = req.cookies.get("clawreview_human_session")?.value;
  if (cookie) return cookie;
  return req.headers.get("x-human-session-token")?.trim() || "";
}

function requireHumanSession(req: NextRequest, store: Awaited<ReturnType<typeof getRuntimeStore>>) {
  const token = getSessionTokenFromRequest(req);
  if (!token) {
    return { ok: false as const, response: unauthorized("Missing human session", { errorCode: ERROR_CODES.unauthorized }) };
  }
  const session = store.getHumanSession(token);
  if (!session) {
    return { ok: false as const, response: unauthorized("Invalid or expired human session", { errorCode: ERROR_CODES.unauthorized }) };
  }
  const human = store.getHuman(session.humanId);
  if (!human) {
    return { ok: false as const, response: unauthorized("Human session owner not found", { errorCode: ERROR_CODES.unauthorized }) };
  }
  return { ok: true as const, session, human };
}

function isAllowedPngFilename(filename: string) {
  const lower = filename.toLowerCase();
  return ALLOWED_ATTACHMENT_EXT.some((ext) => lower.endsWith(ext));
}

function setHumanSessionCookie(res: Response, token: string, options?: { clear?: boolean }) {
  if (!("cookies" in res)) return;
  const nextRes = res as Response & { cookies: { set: (input: Record<string, unknown>) => void } };
  nextRes.cookies.set({
    name: "clawreview_human_session",
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: options?.clear ? 0 : 60 * 60 * 24 * 30
  });
}

async function exchangeGithubCodeForUser(code: string) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { error: "GitHub OAuth is not configured" as const };
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code
    })
  });
  if (!tokenRes.ok) {
    return { error: `GitHub token exchange failed (${tokenRes.status})` as const };
  }
  const tokenBody = await tokenRes.json() as { access_token?: string };
  if (!tokenBody.access_token) {
    return { error: "GitHub access token missing" as const };
  }

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      authorization: `Bearer ${tokenBody.access_token}`,
      accept: "application/vnd.github+json"
    }
  });
  if (!userRes.ok) {
    return { error: `GitHub user fetch failed (${userRes.status})` as const };
  }
  const userBody = await userRes.json() as { id?: number; login?: string };
  if (!userBody.id || !userBody.login) {
    return { error: "GitHub user payload missing id/login" as const };
  }
  return {
    githubId: String(userBody.id),
    githubLogin: userBody.login
  };
}

function isClaimRequestFromClaimPage(req: NextRequest, claimToken: string) {
  const referer = req.headers.get("referer");
  if (!referer) return false;
  try {
    const refererUrl = new URL(referer);
    const appUrl = new URL(getPublicAppUrl(req));
    if (refererUrl.origin !== appUrl.origin) return false;
    const normalizedPath = refererUrl.pathname.replace(/\/+$/, "");
    const expectedPathA = `/claim/${encodeURIComponent(claimToken)}`.replace(/\/+$/, "");
    const expectedPathB = `/claim/${claimToken}`.replace(/\/+$/, "");
    return normalizedPath === expectedPathA || normalizedPath === expectedPathB;
  } catch {
    return false;
  }
}

function normalizePaperManuscript(input: {
  content_sections?: Record<string, string>;
  manuscript?: { format: "markdown"; source: string };
  attachment_asset_ids?: string[];
}) {
  const manuscript = input.manuscript;
  const fallbackContentSections =
    input.content_sections && Object.keys(input.content_sections).length > 0
      ? input.content_sections
      : manuscript
        ? { markdown_source: manuscript.source }
        : {};

  return {
    contentSections: fallbackContentSections,
    manuscriptFormat: manuscript?.format,
    manuscriptSource: manuscript?.source,
    attachmentAssetIds: input.attachment_asset_ids ?? []
  };
}

async function publicPaperView(paperId: string) {
  const store = await getRuntimeStore();
  const paper = store.getPaper(paperId);
  if (!paper) return null;
  const versions = store.listPaperVersions(paperId);
  const currentVersion = versions.find((v) => v.id === paper.currentVersionId) ?? versions[versions.length - 1] ?? null;
  const decisions = currentVersion ? store.listDecisionsForPaperVersion(currentVersion.id) : [];
  const reviews = currentVersion ? store.listReviewsForVersion(currentVersion.id) : [];
  const reviewComments = currentVersion ? store.listPaperReviewCommentsForVersion(currentVersion.id) : [];

  if (paper.publicPurgedAt) {
    return {
      paper,
      currentVersion: currentVersion
        ? {
            id: currentVersion.id,
            versionNumber: currentVersion.versionNumber,
            title: currentVersion.title,
            abstract: currentVersion.abstract,
            domains: currentVersion.domains,
            keywords: currentVersion.keywords,
            claimTypes: currentVersion.claimTypes,
            createdAt: currentVersion.createdAt,
            publicPurgedAt: paper.publicPurgedAt
          }
        : null,
      reviews: [],
      reviewComments: [],
      decisions,
      purgedPublicRecord: store.snapshotState().purgedPublicRecords.find((r) => r.paperId === paper.id) ?? null
    };
  }

  return { paper, versions, currentVersion, reviews, reviewComments, decisions };
}

export async function GET(req: NextRequest) {
  try {
    const store = await getRuntimeStore();
    const segments = parseRouteSegments(req);

    if (segments.length === 2 && segments[0] === "humans" && segments[1] === "me") {
      const sessionState = requireHumanSession(req, store);
      if (!sessionState.ok) return sessionState.response;
      return ok({
        human: {
          id: sessionState.human.id,
          username: sessionState.human.username,
          email: sessionState.human.email,
          emailVerified: Boolean(sessionState.human.emailVerifiedAt),
          githubLinked: Boolean(sessionState.human.githubVerifiedAt),
          githubLogin: sessionState.human.githubLogin ?? null
        }
      });
    }

    if (segments.length === 4 && segments[0] === "humans" && segments[1] === "auth" && segments[2] === "github" && segments[3] === "start") {
      const sessionState = requireHumanSession(req, store);
      if (!sessionState.ok) return sessionState.response;
      const state = store.createGithubLinkState(sessionState.human.id);
      const clientId = process.env.GITHUB_CLIENT_ID;
      if (!clientId) {
        return serverError("GitHub OAuth is not configured", { errorCode: ERROR_CODES.internal });
      }
      const callback = `${getPublicAppUrl(req)}/api/v1/humans/auth/github/callback`;
      const authUrl = new URL("https://github.com/login/oauth/authorize");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("state", state.state);
      authUrl.searchParams.set("redirect_uri", callback);
      return ok({ authorization_url: authUrl.toString(), state: state.state, expires_at: state.expiresAt });
    }

    if (segments.length === 4 && segments[0] === "humans" && segments[1] === "auth" && segments[2] === "github" && segments[3] === "callback") {
      const stateValue = req.nextUrl.searchParams.get("state") || "";
      const code = req.nextUrl.searchParams.get("code") || "";
      if (!stateValue) return badRequest("Missing OAuth state", undefined, { errorCode: ERROR_CODES.badRequest });
      const state = store.consumeGithubLinkState(stateValue);
      if (!state) return unauthorized("Invalid or expired OAuth state", { errorCode: ERROR_CODES.unauthorized });
      let user: { githubId: string; githubLogin: string } | { error: string };
      if (code) {
        user = await exchangeGithubCodeForUser(code);
      } else if (shouldAllowUnsignedDev()) {
        const mockId = req.nextUrl.searchParams.get("mock_id") || randomId("gh");
        const mockLogin = req.nextUrl.searchParams.get("mock_login") || "mock-user";
        user = { githubId: mockId, githubLogin: mockLogin };
      } else {
        user = { error: "Missing OAuth code" };
      }
      if ("error" in user) {
        return badRequest(user.error, undefined, { errorCode: ERROR_CODES.badRequest });
      }
      const linked = store.linkHumanGithub(state.humanId, user.githubId, user.githubLogin);
      if ("error" in linked) {
        return conflict("GitHub account is already linked to another human", { errorCode: ERROR_CODES.conflict });
      }
      await persistRuntimeStore(store);
      return ok({ human: linked.human, github_linked: true });
    }

    if (segments.length === 1 && segments[0] === "agents") {
      return ok({ agents: store.listAgents() });
    }

    if (segments.length === 2 && segments[0] === "agents") {
      const agent = store.getAgent(segments[1]);
      if (!agent) return notFound("Agent not found");
      return ok({ agent });
    }

    if (segments.length === 3 && segments[0] === "agents" && segments[2] === "skill-manifest") {
      const manifest = store.getLatestAgentManifest(segments[1]);
      if (!manifest) return notFound("Skill manifest not found");
      return ok({ manifest });
    }

    if (segments.length === 3 && segments[0] === "agents" && segments[1] === "claim") {
      const claimToken = decodeURIComponent(segments[2]);
      const ticket = store.getAgentClaimTicketByToken(claimToken);
      if (!ticket) return notFound("Claim ticket not found");
      const agent = store.getAgent(ticket.agentId);
      if (!agent) return notFound("Agent not found");
      const sessionToken = getSessionTokenFromRequest(req);
      const session = sessionToken ? store.getHumanSession(sessionToken) : null;
      const currentHuman = session ? store.getHuman(session.humanId) : null;
      return ok({
        claim: {
          ticketId: ticket.id,
          agentId: agent.id,
          agentName: agent.name,
          agentHandle: agent.handle,
          status: ticket.fulfilledAt ? "fulfilled" : "pending",
          expiresAt: ticket.expiresAt,
          fulfilledAt: ticket.fulfilledAt ?? null,
          claimRequirements: {
            emailVerified: Boolean(currentHuman?.emailVerifiedAt),
            githubLinked: Boolean(currentHuman?.githubVerifiedAt),
            claimable: Boolean(currentHuman?.emailVerifiedAt && currentHuman?.githubVerifiedAt)
          }
        }
      });
    }

    if (segments.length === 4 && segments[0] === "agents" && segments[2] === "skill-manifest" && segments[3] === "history") {
      return ok({ history: store.getAgentManifestHistory(segments[1]) });
    }

    if (segments.length === 2 && segments[0] === "assets") {
      const asset = store.getAsset(segments[1]);
      if (!asset) return notFound("Asset not found", { errorCode: ERROR_CODES.assetNotFound });
      return ok({ asset });
    }

    if (segments.length === 1 && segments[0] === "papers") {
      const status = req.nextUrl.searchParams.get("status") || undefined;
      return ok({ papers: store.listPapers({ status: status || undefined }) });
    }

    if (segments.length === 2 && segments[0] === "papers") {
      const view = await publicPaperView(segments[1]);
      if (!view) return notFound("Paper not found");
      return ok(view);
    }

    if (segments.length === 3 && segments[0] === "papers" && segments[2] === "reviews") {
      const paper = store.getPaper(segments[1]);
      if (!paper) return notFound("Paper not found");
      const version = store.getCurrentPaperVersion(paper.id);
      if (!version) return ok({ comments: [] });
      return ok({ comments: store.listPaperReviewCommentsForVersion(version.id) });
    }

    if (segments.length === 5 && segments[0] === "papers" && segments[2] === "versions" && segments[4] === "reviews") {
      const [_, paperId, __, versionId] = segments;
      const paper = store.getPaper(paperId);
      if (!paper) return notFound("Paper not found");
      const version = store.getPaperVersion(versionId);
      if (!version || version.paperId !== paperId) return notFound("Paper version not found");
      if (paper.publicPurgedAt) return ok({ reviews: [], paperPurged: true, paperId, versionId });
      return ok({ reviews: store.listReviewsForVersion(versionId) });
    }

    if (segments.length === 4 && segments[0] === "papers" && segments[2] === "versions") {
      const paper = store.getPaper(segments[1]);
      if (!paper) return notFound("Paper not found");
      const version = store.getPaperVersion(segments[3]);
      if (!version || version.paperId !== paper.id) return notFound("Paper version not found");
      if (paper.publicPurgedAt) {
        return ok({
          version: {
            id: version.id,
            versionNumber: version.versionNumber,
            title: version.title,
            abstract: version.abstract,
            domains: version.domains,
            keywords: version.keywords,
            claimTypes: version.claimTypes,
            createdAt: version.createdAt,
            publicPurgedAt: paper.publicPurgedAt
          }
        });
      }
      return ok({
        version,
        assignments: store.listAssignmentsForVersion(version.id),
        decisions: store.listDecisionsForPaperVersion(version.id)
      });
    }

    if (segments.length === 1 && segments[0] === "assignments") {
      return badRequest("Use GET /api/v1/assignments/open");
    }

    if (segments.length === 2 && segments[0] === "assignments" && segments[1] === "open") {
      const signed = await requireSignedAgentRequest(req, "");
      if (!signed.ok) return signed.response;
      const agent = signed.agent;
      if (!agent) return badRequest("Unsigned dev mode cannot be used for this endpoint");
      return ok({ assignments: store.listOpenAssignmentsForAgent(agent.id) });
    }

    if (segments.length === 1 && segments[0] === "guidelines") {
      return badRequest("Use /api/v1/guidelines/current or /api/v1/guidelines/{versionId}");
    }

    if (segments.length === 2 && segments[0] === "guidelines" && segments[1] === "current") {
      const guideline = store.getCurrentGuideline();
      return ok({ guideline });
    }

    if (segments.length === 2 && segments[0] === "guidelines") {
      const guideline = store.getGuideline(segments[1]);
      if (!guideline) return notFound("Guideline not found");
      return ok({ guideline });
    }

    if (segments.length === 1 && segments[0] === "domains") {
      return ok({ domains: store.listDomains() });
    }

    if (segments.length === 3 && segments[0] === "domains" && segments[2] === "guidelines") {
      const domain = store.listDomains().find((d) => d.id === segments[1]);
      if (!domain) return notFound("Domain not found");
      return ok({ domain, guidelines: store.listGuidelines().filter((g) => g.domains.includes("*") || g.domains.includes(domain.id)) });
    }

    if (segments.length === 2 && segments[0] === "reviews") {
      const review = store.getReview(segments[1]);
      if (!review) return notFound("Review not found");
      const paper = store.getPaper(review.paperId);
      if (paper?.publicPurgedAt) {
        return ok({ reviewId: review.id, paperPurged: true });
      }
      return ok({ review });
    }

    if (segments.length === 1 && segments[0] === "accepted") {
      return ok({ papers: store.listPapers({ status: "accepted" }) });
    }

    if (segments.length === 1 && segments[0] === "under-review") {
      return ok({ papers: store.listPapers({ status: "under_review" }) });
    }

    if (segments.length === 1 && segments[0] === "rejected-archive") {
      const papers = store.listPapers({ status: "rejected" });
      return ok({ papers });
    }

    if (segments.length === 2 && segments[0] === "operator" && segments[1] === "audit-events") {
      const operator = requireOperator(req);
      if (!operator.ok) return operator.response;
      return ok({ auditEvents: store.listAuditEvents() });
    }

    return notFound("Route not found");
  } catch (error) {
    return serverError("Internal server error", { errorCode: ERROR_CODES.internal });
  }
}

export async function POST(req: NextRequest) {
  try {
    const store = await getRuntimeStore();
    const segments = parseRouteSegments(req);
    const bodyText = await req.text();

    if (segments.length === 3 && segments[0] === "humans" && segments[1] === "auth" && segments[2] === "start-email") {
      const limit = applyRateLimit(
        store,
        `human-email-start:ip:${clientIp(req)}`,
        RATE_LIMITS.emailAuthPerIpPer10Min,
        "Too many email verification attempts",
        ERROR_CODES.rateLimited
      );
      if (limit) return limit;

      const parsed = humanAuthStartEmailRequestSchema.safeParse(parseJsonBody<unknown>(bodyText || "{}"));
      if (!parsed.success) {
        return unprocessableEntity("Invalid email auth payload", {
          errorCode: ERROR_CODES.unprocessableEntity,
          fieldErrors: zodFieldErrors(parsed.error)
        });
      }

      const started = store.startHumanEmailVerification(parsed.data.email, parsed.data.username);
      await persistRuntimeStore(store);
      const response = {
        human_id: started.human.id,
        email: started.human.email,
        status: "verification_sent",
        delivery: "simulated",
        ...(shouldAllowUnsignedDev() ? { verification_code_dev_only: started.verification.code } : {})
      };
      return created(response);
    }

    if (segments.length === 3 && segments[0] === "humans" && segments[1] === "auth" && segments[2] === "verify-email") {
      const limit = applyRateLimit(
        store,
        `human-email-verify:ip:${clientIp(req)}`,
        RATE_LIMITS.emailAuthPerIpPer10Min,
        "Too many email code verification attempts",
        ERROR_CODES.rateLimited
      );
      if (limit) return limit;

      const parsed = humanAuthVerifyEmailRequestSchema.safeParse(parseJsonBody<unknown>(bodyText || "{}"));
      if (!parsed.success) {
        return unprocessableEntity("Invalid email verification payload", {
          errorCode: ERROR_CODES.unprocessableEntity,
          fieldErrors: zodFieldErrors(parsed.error)
        });
      }
      const verified = store.verifyHumanEmailCode(parsed.data.email, parsed.data.code);
      if ("error" in verified) {
        if (verified.error === "EMAIL_VERIFICATION_INVALID_CODE") {
          return unauthorized("Invalid verification code", {
            errorCode: ERROR_CODES.unauthorized,
            hint: "Request a new email code and try again."
          });
        }
        if (verified.error === "EMAIL_VERIFICATION_EXPIRED") {
          return unauthorized("Verification code expired", {
            errorCode: ERROR_CODES.unauthorized,
            hint: "Request a new email code."
          });
        }
        return notFound("Email verification request not found", { errorCode: ERROR_CODES.notFound });
      }
      await persistRuntimeStore(store);
      const res = ok({
        human: {
          id: verified.human.id,
          username: verified.human.username,
          email: verified.human.email,
          emailVerified: true,
          githubLinked: Boolean(verified.human.githubVerifiedAt)
        }
      });
      setHumanSessionCookie(res, verified.session.token);
      return res;
    }

    if (segments.length === 2 && segments[0] === "humans" && segments[1] === "logout") {
      const token = getSessionTokenFromRequest(req);
      if (token) store.deleteHumanSession(token);
      await persistRuntimeStore(store);
      const res = ok({ logged_out: true });
      setHumanSessionCookie(res, "", { clear: true });
      return res;
    }

    if (segments.length === 2 && segments[0] === "assets" && segments[1] === "init") {
      const signed = await requireSignedAgentRequest(req, bodyText);
      if (!signed.ok) return signed.response;
      const agent = signed.agent;
      if (!agent) return badRequest("Unsigned dev mode cannot initialize assets", undefined, { errorCode: ERROR_CODES.badRequest });
      const replay = await maybeReplayIdempotency(req, agent.id);
      if (replay) return replay;

      const parsed = assetInitRequestSchema.safeParse(parseJsonBody<unknown>(bodyText || "{}"));
      if (!parsed.success) {
        return unprocessableEntity("Invalid asset init payload", {
          errorCode: ERROR_CODES.unprocessableEntity,
          fieldErrors: zodFieldErrors(parsed.error)
        });
      }
      const payload = parsed.data;
      if (!ALLOWED_ATTACHMENT_MIME.includes(payload.content_type)) {
        return unprocessableEntity("Only PNG is allowed", {
          errorCode: ERROR_CODES.assetTypeNotAllowed,
          hint: "Set content_type to image/png."
        });
      }
      if (!isAllowedPngFilename(payload.filename)) {
        return unprocessableEntity("Attachment filename must end with .png", {
          errorCode: ERROR_CODES.assetTypeNotAllowed
        });
      }
      if (payload.byte_size > MAX_ATTACHMENT_BYTES) {
        return unprocessableEntity("PNG must be at most 1 MB", {
          errorCode: ERROR_CODES.assetTooLarge,
          fieldErrors: [{ field: "byte_size", rule: "max", expected: MAX_ATTACHMENT_BYTES, actual: payload.byte_size }]
        });
      }

      const intent = store.createAssetUploadIntent({
        ownerAgentId: agent.id,
        filename: payload.filename,
        contentType: payload.content_type,
        byteSize: payload.byte_size,
        sha256: payload.sha256.toLowerCase()
      });
      const uploadPath = `/api/v1/assets/${intent.id}/upload?token=${encodeURIComponent(intent.uploadToken)}`;
      const responseBody = {
        asset: {
          id: intent.id,
          status: intent.status,
          byte_size: intent.byteSize,
          content_type: intent.contentType,
          filename: intent.filename
        },
        upload: {
          method: "PUT",
          upload_url: `${getPublicAppUrl(req)}${uploadPath}`,
          expires_at: intent.uploadTokenExpiresAt
        }
      };
      return await respondIdempotent(req, agent.id, 201, responseBody);
    }

    if (segments.length === 2 && segments[0] === "assets" && segments[1] === "complete") {
      const signed = await requireSignedAgentRequest(req, bodyText);
      if (!signed.ok) return signed.response;
      const agent = signed.agent;
      if (!agent) return badRequest("Unsigned dev mode cannot complete assets", undefined, { errorCode: ERROR_CODES.badRequest });
      const replay = await maybeReplayIdempotency(req, agent.id);
      if (replay) return replay;

      const parsed = assetCompleteRequestSchema.safeParse(parseJsonBody<unknown>(bodyText || "{}"));
      if (!parsed.success) {
        return unprocessableEntity("Invalid asset completion payload", {
          errorCode: ERROR_CODES.unprocessableEntity,
          fieldErrors: zodFieldErrors(parsed.error)
        });
      }
      const result = store.completeAssetUpload({ assetId: parsed.data.asset_id, ownerAgentId: agent.id });
      if ("error" in result) {
        if (result.error === "Asset not found") {
          return notFound("Asset not found", { errorCode: ERROR_CODES.assetNotFound });
        }
        if (result.error === "Asset is not owned by agent") {
          return forbidden("Asset does not belong to the signed agent", { errorCode: ERROR_CODES.assetNotOwnedByAgent });
        }
        if (result.error === "Asset hash mismatch") {
          return unprocessableEntity("Asset hash mismatch", { errorCode: ERROR_CODES.assetHashMismatch });
        }
        if (result.error === "Asset too large") {
          return unprocessableEntity("PNG must be at most 1 MB", { errorCode: ERROR_CODES.assetTooLarge });
        }
        if (result.error === "Asset not uploaded") {
          return conflict("Asset upload is not complete", { errorCode: ERROR_CODES.assetUploadUrlExpired });
        }
        if (result.error === "Asset signature invalid") {
          return unprocessableEntity("Uploaded file is not a valid PNG", { errorCode: ERROR_CODES.assetTypeNotAllowed });
        }
        return conflict(result.error ?? "Asset completion failed", { errorCode: ERROR_CODES.conflict });
      }
      return await respondIdempotent(req, agent.id, 200, { asset: result.asset, completed: true });
    }

    if (segments.length === 2 && segments[0] === "agents" && segments[1] === "register") {
      const replay = await maybeReplayIdempotency(req, undefined);
      if (replay) return replay;
      const registrationRateLimit = applyRateLimit(
        store,
        `register:ip:${clientIp(req)}`,
        RATE_LIMITS.registrationPerIpPer10Min,
        "Registration rate exceeded",
        ERROR_CODES.rateLimited
      );
      if (registrationRateLimit) return registrationRateLimit;

      const parsedBody = agentRegistrationRequestSchema.safeParse(parseJsonBody<unknown>(bodyText || "{}"));
      if (!parsedBody.success) {
        return unprocessableEntity("Invalid registration payload", {
          errorCode: ERROR_CODES.unprocessableEntity,
          fieldErrors: zodFieldErrors(parsedBody.error)
        });
      }

      const payload = parsedBody.data;
      const urlCheck = validateAgentUrlRequirements(payload);
      if (!urlCheck.ok) return urlCheck.response;
      const manifest = await fetchAndParseSkillManifest(payload.skill_md_url);
      const frontMatter = manifest.frontMatter;
      const effective = {
        agent_name: payload.agent_name ?? frontMatter.agent_name,
        agent_handle: payload.agent_handle ?? frontMatter.agent_handle,
        public_key: payload.public_key ?? frontMatter.public_key,
        endpoint_base_url: payload.endpoint_base_url ?? frontMatter.endpoint_base_url,
        capabilities: payload.capabilities ?? frontMatter.capabilities,
        domains: payload.domains ?? frontMatter.domains,
        protocol_version: payload.protocol_version ?? frontMatter.protocol_version
      } as const;

      if (payload.agent_handle && frontMatter.agent_handle !== payload.agent_handle) {
        return unprocessableEntity("agent_handle mismatch between payload and skill.md", { errorCode: ERROR_CODES.unprocessableEntity });
      }
      if (payload.agent_name && frontMatter.agent_name !== payload.agent_name) {
        return unprocessableEntity("agent_name mismatch between payload and skill.md", { errorCode: ERROR_CODES.unprocessableEntity });
      }
      if (payload.public_key && frontMatter.public_key !== payload.public_key) {
        return unprocessableEntity("public_key mismatch between payload and skill.md", { errorCode: ERROR_CODES.unprocessableEntity });
      }
      if (payload.endpoint_base_url && frontMatter.endpoint_base_url !== payload.endpoint_base_url) {
        return unprocessableEntity("endpoint_base_url mismatch between payload and skill.md", { errorCode: ERROR_CODES.unprocessableEntity });
      }
      if (payload.protocol_version && frontMatter.protocol_version !== payload.protocol_version) {
        return unprocessableEntity("protocol_version mismatch between payload and skill.md", { errorCode: ERROR_CODES.unprocessableEntity });
      }

      const effectiveUrlCheck = validateAgentUrlRequirements({ skill_md_url: payload.skill_md_url, endpoint_base_url: effective.endpoint_base_url });
      if (!effectiveUrlCheck.ok) return effectiveUrlCheck.response;

      const domainValidation = validateKnownDomainsWithStore(store, effective.domains);
      if (!domainValidation.valid) {
        return unprocessableEntity(`Unknown domains: ${domainValidation.unknown.join(", ")}`, {
          errorCode: ERROR_CODES.unprocessableEntity
        });
      }

      const verifiedOriginDomain = parseHostname(payload.skill_md_url);
      const registered = store.createOrReplacePendingAgent({
        name: effective.agent_name,
        handle: effective.agent_handle,
        publicKey: effective.public_key,
        endpointBaseUrl: effective.endpoint_base_url,
        skillMdUrl: payload.skill_md_url,
        verifiedOriginDomain,
        capabilities: effective.capabilities,
        domains: effective.domains,
        protocolVersion: effective.protocol_version,
        contactEmail: payload.contact_email,
        contactUrl: payload.contact_url
      });
      if ("error" in registered) {
        if (registered.error === "HANDLE_ALREADY_CLAIMED") {
          return conflict("agent_handle is already claimed by an active identity", {
            errorCode: ERROR_CODES.handleAlreadyClaimed,
            hint: "Choose another agent_handle."
          });
        }
        return conflict("Agent registration conflict", { errorCode: ERROR_CODES.conflict });
      }
      const { agent } = registered;

      const snapshot = store.saveAgentManifestSnapshot({
        agentId: agent.id,
        skillMdUrl: payload.skill_md_url,
        raw: manifest.raw,
        hash: manifest.sha256,
        frontMatter,
        requiredSections: manifest.requiredSections
      });

      const challenge = store.createAgentVerificationChallenge(agent.id);
      const claimTicket = store.createAgentClaimTicket(agent.id);
      if (!claimTicket) return serverError("Failed to create claim ticket");
      const appBaseUrl = getPublicAppUrl(req);
      const responseBody = {
        agent,
        challenge: {
          id: challenge.id,
          message: challenge.message,
          expiresAt: challenge.expiresAt
        },
        claim: {
          id: claimTicket.id,
          expiresAt: claimTicket.expiresAt,
          claimUrl: `${appBaseUrl}/claim/${encodeURIComponent(claimTicket.token)}`
        },
        manifest: {
          hash: snapshot.hash,
          fetchedAt: snapshot.fetchedAt
        }
      };
      return await respondIdempotent(req, undefined, 201, responseBody);
    }

    if (segments.length === 2 && segments[0] === "agents" && segments[1] === "verify-challenge") {
      const replay = await maybeReplayIdempotency(req, undefined);
      if (replay) return replay;
      const verifyRateLimit = applyRateLimit(
        store,
        `verify:ip:${clientIp(req)}`,
        RATE_LIMITS.verifyPerIpPer10Min,
        "Verification rate exceeded",
        ERROR_CODES.rateLimited
      );
      if (verifyRateLimit) return verifyRateLimit;

      const parsedBody = agentVerifyChallengeRequestSchema.safeParse(parseJsonBody<unknown>(bodyText || "{}"));
      if (!parsedBody.success) {
        return unprocessableEntity("Invalid challenge verification payload", {
          errorCode: ERROR_CODES.unprocessableEntity,
          fieldErrors: zodFieldErrors(parsedBody.error)
        });
      }
      const payload = parsedBody.data;

      const agent = store.getAgent(payload.agent_id);
      const challenge = store.getAgentVerificationChallenge(payload.challenge_id);
      if (!agent || !challenge || challenge.agentId !== agent.id) {
        return notFound("Challenge or agent not found", { errorCode: ERROR_CODES.notFound });
      }
      if (challenge.fulfilledAt) return conflict("Challenge already fulfilled", { errorCode: ERROR_CODES.conflict });
      if (new Date(challenge.expiresAt).getTime() <= Date.now()) return unauthorized("Challenge expired", { errorCode: ERROR_CODES.unauthorized });

      let valid = false;
      try {
        valid = verifyEd25519Signature({ publicKey: agent.publicKey, message: challenge.message, signature: payload.signature });
      } catch (error) {
        return badRequest(error instanceof Error ? error.message : "Invalid signature payload", undefined, { errorCode: ERROR_CODES.badRequest });
      }
      if (!valid) return unauthorized("Invalid challenge signature", { errorCode: ERROR_CODES.unauthorized });

      const activated = store.fulfillAgentVerification(agent.id, challenge.id);
      if (!activated) return serverError("Failed to verify agent challenge", { errorCode: ERROR_CODES.internal });
      const responseBody = {
        agent: activated,
        verification: {
          challengeVerified: Boolean(activated.challengeVerifiedAt),
          humanClaimed: Boolean(activated.humanClaimedAt),
          active: activated.status === "active"
        }
      };
      return await respondIdempotent(req, undefined, 200, responseBody);
    }

    if (segments.length === 2 && segments[0] === "agents" && segments[1] === "claim") {
      const replay = await maybeReplayIdempotency(req, undefined);
      if (replay) return replay;
      const claimRateLimit = applyRateLimit(
        store,
        `claim:ip:${clientIp(req)}`,
        RATE_LIMITS.claimPerIpPer10Min,
        "Claim rate exceeded",
        ERROR_CODES.rateLimited
      );
      if (claimRateLimit) return claimRateLimit;

      const parsedBody = agentClaimRequestSchema.safeParse(parseJsonBody<unknown>(bodyText || "{}"));
      if (!parsedBody.success) {
        return unprocessableEntity("Invalid claim payload", {
          errorCode: ERROR_CODES.unprocessableEntity,
          fieldErrors: zodFieldErrors(parsedBody.error)
        });
      }
      const payload = parsedBody.data;
      const sessionState = requireHumanSession(req, store);
      if (!sessionState.ok) return sessionState.response;
      if (!sessionState.human.emailVerifiedAt) {
        return forbidden("Human email must be verified before claim", {
          errorCode: ERROR_CODES.emailNotVerified,
          hint: "Complete POST /api/v1/humans/auth/verify-email first."
        });
      }
      if (!sessionState.human.githubVerifiedAt) {
        return forbidden("GitHub account must be linked before claim", {
          errorCode: ERROR_CODES.githubNotLinked,
          hint: "Complete GitHub OAuth link before claiming this agent."
        });
      }
      if (!isClaimRequestFromClaimPage(req, payload.claim_token) && !shouldAllowUnsignedDev()) {
        return forbidden("Claim must be confirmed from the claim page", { errorCode: ERROR_CODES.forbidden });
      }
      const result = store.fulfillAgentHumanClaim({
        claimToken: payload.claim_token,
        humanId: sessionState.human.id,
        replaceExisting: payload.replace_existing
      });
      if ("error" in result) {
        const errorMessage = result.error ?? "Claim failed";
        if (errorMessage === "Claim ticket not found") {
          return notFound(errorMessage, { errorCode: ERROR_CODES.claimTokenInvalid });
        }
        if (errorMessage === "Claim ticket expired") {
          return unauthorized(errorMessage, { errorCode: ERROR_CODES.claimTokenExpired });
        }
        if (errorMessage === "Claim ticket already fulfilled") {
          return conflict(errorMessage, { errorCode: ERROR_CODES.conflict });
        }
        if (errorMessage === "Replace required") {
          return conflict("This human already owns an active agent. Use replace_existing=true.", {
            errorCode: ERROR_CODES.replaceRequired,
            hint: "Set replace_existing=true to deactivate the old agent and claim this one."
          });
        }
        return badRequest(errorMessage, undefined, { errorCode: ERROR_CODES.badRequest });
      }
      return await respondIdempotent(req, undefined, 200, {
        agent: result.agent,
        claim: {
          ticketId: result.ticket.id,
          fulfilledAt: result.ticket.fulfilledAt,
          active: result.agent.status === "active",
          humanId: result.human.id
        },
        human: {
          id: result.human.id,
          email: result.human.email,
          githubLogin: result.human.githubLogin ?? null
        }
      });
    }

    if (segments.length === 3 && segments[0] === "agents" && segments[2] === "reverify") {
      const signed = await requireSignedAgentRequest(req, bodyText);
      if (!signed.ok) return signed.response;
      const agent = signed.agent;
      if (!agent) return badRequest("Unsigned dev mode cannot reverify", undefined, { errorCode: ERROR_CODES.badRequest });
      if (agent.id !== segments[1]) return forbidden("Signed agent does not match path agentId", { errorCode: ERROR_CODES.forbidden });
      const signedRateLimit = applyCommonSignedWriteLimits(store, agent);
      if (signedRateLimit) return signedRateLimit;

      const replay = await maybeReplayIdempotency(req, agent.id);
      if (replay) return replay;

      const manifest = await fetchAndParseSkillManifest(agent.skillMdUrl);
      if (manifest.frontMatter.public_key !== agent.publicKey) {
        return badRequest("public_key mismatch between skill.md and agent record", undefined, { errorCode: ERROR_CODES.badRequest });
      }
      if (manifest.frontMatter.endpoint_base_url !== agent.endpointBaseUrl) {
        return badRequest("endpoint_base_url mismatch between skill.md and agent record", undefined, { errorCode: ERROR_CODES.badRequest });
      }

      const snapshot = store.saveAgentManifestSnapshot({
        agentId: agent.id,
        skillMdUrl: agent.skillMdUrl,
        raw: manifest.raw,
        hash: manifest.sha256,
        frontMatter: manifest.frontMatter,
        requiredSections: manifest.requiredSections
      });
      const updated = store.revalidateAgentSkill(agent.id, snapshot);
      return await respondIdempotent(req, agent.id, 200, { agent: updated, manifestHash: snapshot.hash });
    }

    if (segments.length === 1 && segments[0] === "papers") {
      const signed = await requireSignedAgentRequest(req, bodyText);
      if (!signed.ok) return signed.response;
      const agent = signed.agent;
      if (!agent) return badRequest("Unsigned dev mode cannot submit papers", undefined, { errorCode: ERROR_CODES.badRequest });
      const signedRateLimit = applyCommonSignedWriteLimits(store, agent);
      if (signedRateLimit) return signedRateLimit;
      const paperDailyLimit = applyRateLimit(
        store,
        `paper:agent:${agent.id}:24h`,
        RATE_LIMITS.paperSubmissionsPerAgent24h,
        "Paper submission daily limit exceeded",
        ERROR_CODES.paperRateLimitExceeded
      );
      if (paperDailyLimit) return paperDailyLimit;

      const replay = await maybeReplayIdempotency(req, agent.id);
      if (replay) return replay;

      const parsedBody = paperSubmissionRequestSchema.safeParse(parseJsonBody<unknown>(bodyText || "{}"));
      if (!parsedBody.success) {
        return unprocessableEntity("Invalid paper submission", {
          errorCode: pickPaperValidationCode(parsedBody.error),
          fieldErrors: zodFieldErrors(parsedBody.error),
          hint: "Fix manuscript format/length/sections and retry."
        });
      }
      const payload = parsedBody.data;
      if (payload.publisher_agent_id !== agent.id) {
        return forbidden("publisher_agent_id must match signed agent", { errorCode: ERROR_CODES.forbidden });
      }
      if (!payload.manuscript) {
        return unprocessableEntity("manuscript is required", {
          errorCode: ERROR_CODES.paperFormatNotAllowed
        });
      }
      const manuscript = payload.manuscript;
      const domainValidation = validateKnownDomainsWithStore(store, payload.domains);
      if (!domainValidation.valid) {
        return unprocessableEntity(`Unknown domains: ${domainValidation.unknown.join(", ")}`, {
          errorCode: ERROR_CODES.unprocessableEntity
        });
      }
      if (manuscript.format !== "markdown") {
        return unprocessableEntity("Only markdown manuscript format is allowed", {
          errorCode: ERROR_CODES.paperFormatNotAllowed,
          fieldErrors: [{ field: "manuscript.format", rule: "equals", expected: "markdown", actual: manuscript.format }]
        });
      }
      if (manuscript.source.length < PAPER_MANUSCRIPT_MIN_CHARS || manuscript.source.length > PAPER_MANUSCRIPT_MAX_CHARS) {
        return unprocessableEntity(`manuscript.source must be between ${PAPER_MANUSCRIPT_MIN_CHARS} and ${PAPER_MANUSCRIPT_MAX_CHARS} characters.`, {
          errorCode: ERROR_CODES.paperLengthOutOfRange,
          fieldErrors: [{
            field: "manuscript.source",
            rule: "length_range",
            expected: `${PAPER_MANUSCRIPT_MIN_CHARS}..${PAPER_MANUSCRIPT_MAX_CHARS}`,
            actual: manuscript.source.length
          }],
          hint: "Adjust manuscript length and retry."
        });
      }
      if ((payload.attachment_asset_ids ?? []).length > MAX_ATTACHMENT_COUNT_PER_PAPER) {
        return unprocessableEntity(`No more than ${MAX_ATTACHMENT_COUNT_PER_PAPER} attachments are allowed`, {
          errorCode: ERROR_CODES.paperTooManyAttachments
        });
      }
      const duplicate = store.findPaperVersionByExactManuscript(manuscript.source);
      if (duplicate) {
        return conflict("An identical manuscript already exists", {
          errorCode: ERROR_CODES.paperDuplicateExact,
          hint: "Submit a revised manuscript source."
        });
      }
      const attachments = payload.attachment_asset_ids ?? [];
      const attachmentCheck = store.validateAttachmentAssets(agent.id, attachments);
      if ("error" in attachmentCheck) {
        if (attachmentCheck.error === "Asset not found") {
          return notFound("Attachment asset not found", { errorCode: ERROR_CODES.assetNotFound });
        }
        if (attachmentCheck.error === "Asset is not owned by agent") {
          return forbidden("Attachment asset does not belong to the signed agent", { errorCode: ERROR_CODES.assetNotOwnedByAgent });
        }
        if (attachmentCheck.error === "Asset not completed") {
          return conflict("Attachment asset is not completed", { errorCode: ERROR_CODES.assetNotCompleted });
        }
        return unprocessableEntity(attachmentCheck.error ?? "Attachment validation failed", { errorCode: ERROR_CODES.unprocessableEntity });
      }

      const createdPaper = store.createPaperWithVersion({
        ...normalizePaperManuscript(payload),
        publisherAgentId: agent.id,
        title: payload.title,
        abstract: payload.abstract,
        domains: payload.domains,
        keywords: payload.keywords,
        claimTypes: payload.claim_types,
        language: payload.language,
        references: payload.references,
        sourceRepoUrl: payload.source_repo_url,
        sourceRef: payload.source_ref,
        guidelineVersionId: DEFAULT_GUIDELINE_VERSION_ID
      });
      store.recomputePaperDecision(createdPaper.paper.id, createdPaper.version.id);
      return await respondIdempotent(req, agent.id, 201, createdPaper);
    }

    if (segments.length === 3 && segments[0] === "papers" && segments[2] === "versions") {
      const paperId = segments[1];
      const paper = store.getPaper(paperId);
      if (!paper) return notFound("Paper not found", { errorCode: ERROR_CODES.notFound });

      const signed = await requireSignedAgentRequest(req, bodyText);
      if (!signed.ok) return signed.response;
      const agent = signed.agent;
      if (!agent) return badRequest("Unsigned dev mode cannot submit paper versions", undefined, { errorCode: ERROR_CODES.badRequest });
      if (paper.publisherAgentId !== agent.id) {
        return forbidden("Only the original publisher agent can submit a new version", { errorCode: ERROR_CODES.forbidden });
      }
      const signedRateLimit = applyCommonSignedWriteLimits(store, agent);
      if (signedRateLimit) return signedRateLimit;
      const paperDailyLimit = applyRateLimit(
        store,
        `paper:agent:${agent.id}:24h`,
        RATE_LIMITS.paperSubmissionsPerAgent24h,
        "Paper submission daily limit exceeded",
        ERROR_CODES.paperRateLimitExceeded
      );
      if (paperDailyLimit) return paperDailyLimit;

      const replay = await maybeReplayIdempotency(req, agent.id);
      if (replay) return replay;

      const parsedBody = paperVersionRequestSchema.safeParse(parseJsonBody<unknown>(bodyText || "{}"));
      if (!parsedBody.success) {
        return unprocessableEntity("Invalid paper version payload", {
          errorCode: pickPaperValidationCode(parsedBody.error),
          fieldErrors: zodFieldErrors(parsedBody.error)
        });
      }
      const payload = parsedBody.data;
      if (!payload.manuscript) {
        return unprocessableEntity("manuscript is required", {
          errorCode: ERROR_CODES.paperFormatNotAllowed
        });
      }
      const manuscript = payload.manuscript;
      const domainValidation = validateKnownDomainsWithStore(store, payload.domains);
      if (!domainValidation.valid) {
        return unprocessableEntity(`Unknown domains: ${domainValidation.unknown.join(", ")}`, {
          errorCode: ERROR_CODES.unprocessableEntity
        });
      }
      if (manuscript.format !== "markdown") {
        return unprocessableEntity("Only markdown manuscript format is allowed", { errorCode: ERROR_CODES.paperFormatNotAllowed });
      }
      if (manuscript.source.length < PAPER_MANUSCRIPT_MIN_CHARS || manuscript.source.length > PAPER_MANUSCRIPT_MAX_CHARS) {
        return unprocessableEntity(`manuscript.source must be between ${PAPER_MANUSCRIPT_MIN_CHARS} and ${PAPER_MANUSCRIPT_MAX_CHARS} characters.`, {
          errorCode: ERROR_CODES.paperLengthOutOfRange,
          fieldErrors: [{
            field: "manuscript.source",
            rule: "length_range",
            expected: `${PAPER_MANUSCRIPT_MIN_CHARS}..${PAPER_MANUSCRIPT_MAX_CHARS}`,
            actual: manuscript.source.length
          }]
        });
      }
      if ((payload.attachment_asset_ids ?? []).length > MAX_ATTACHMENT_COUNT_PER_PAPER) {
        return unprocessableEntity(`No more than ${MAX_ATTACHMENT_COUNT_PER_PAPER} attachments are allowed`, {
          errorCode: ERROR_CODES.paperTooManyAttachments
        });
      }
      const duplicate = store.findPaperVersionByExactManuscript(manuscript.source);
      if (duplicate) {
        return conflict("An identical manuscript already exists", { errorCode: ERROR_CODES.paperDuplicateExact });
      }
      const attachments = payload.attachment_asset_ids ?? [];
      const attachmentCheck = store.validateAttachmentAssets(agent.id, attachments);
      if ("error" in attachmentCheck) {
        if (attachmentCheck.error === "Asset not found") {
          return notFound("Attachment asset not found", { errorCode: ERROR_CODES.assetNotFound });
        }
        if (attachmentCheck.error === "Asset is not owned by agent") {
          return forbidden("Attachment asset does not belong to the signed agent", { errorCode: ERROR_CODES.assetNotOwnedByAgent });
        }
        if (attachmentCheck.error === "Asset not completed") {
          return conflict("Attachment asset is not completed", { errorCode: ERROR_CODES.assetNotCompleted });
        }
        return unprocessableEntity(attachmentCheck.error ?? "Attachment validation failed", { errorCode: ERROR_CODES.unprocessableEntity });
      }

      const createdVersion = store.createPaperVersion(paperId, {
        ...normalizePaperManuscript(payload),
        publisherAgentId: agent.id,
        title: payload.title,
        abstract: payload.abstract,
        domains: payload.domains,
        keywords: payload.keywords,
        claimTypes: payload.claim_types,
        language: payload.language,
        references: payload.references,
        sourceRepoUrl: payload.source_repo_url,
        sourceRef: payload.source_ref,
        guidelineVersionId: DEFAULT_GUIDELINE_VERSION_ID
      });
      if (!createdVersion) return serverError("Failed to create paper version", { errorCode: ERROR_CODES.internal });
      store.recomputePaperDecision(paperId, createdVersion.version.id);
      return await respondIdempotent(req, agent.id, 201, createdVersion);
    }

    if (segments.length === 3 && segments[0] === "assignments" && segments[2] === "claim") {
      const signed = await requireSignedAgentRequest(req, bodyText);
      if (!signed.ok) return signed.response;
      const agent = signed.agent;
      if (!agent) return badRequest("Unsigned dev mode cannot claim assignments", undefined, { errorCode: ERROR_CODES.badRequest });
      const signedRateLimit = applyCommonSignedWriteLimits(store, agent);
      if (signedRateLimit) return signedRateLimit;

      const replay = await maybeReplayIdempotency(req, agent.id);
      if (replay) return replay;

      const parsedBody = assignmentClaimRequestSchema.safeParse(parseJsonBody<unknown>(bodyText || "{}"));
      if (!parsedBody.success) {
        return unprocessableEntity("Invalid assignment claim payload", {
          errorCode: ERROR_CODES.unprocessableEntity,
          fieldErrors: zodFieldErrors(parsedBody.error)
        });
      }
      if (parsedBody.data.agent_id !== agent.id) return forbidden("agent_id must match signed agent", { errorCode: ERROR_CODES.forbidden });
      const result = store.claimAssignment(segments[1], agent.id);
      if ("error" in result) return conflict(result.error ?? "Assignment claim failed", { errorCode: ERROR_CODES.conflict });
      return await respondIdempotent(req, agent.id, 200, result);
    }

    if (segments.length === 3 && segments[0] === "assignments" && segments[2] === "reviews") {
      const signed = await requireSignedAgentRequest(req, bodyText);
      if (!signed.ok) return signed.response;
      const agent = signed.agent;
      if (!agent) return badRequest("Unsigned dev mode cannot submit reviews", undefined, { errorCode: ERROR_CODES.badRequest });
      const signedRateLimit = applyCommonSignedWriteLimits(store, agent);
      if (signedRateLimit) return signedRateLimit;

      const replay = await maybeReplayIdempotency(req, agent.id);
      if (replay) return replay;

      const parsedBody = reviewSubmissionRequestSchema.safeParse(parseJsonBody<unknown>(bodyText || "{}"));
      if (!parsedBody.success) {
        return unprocessableEntity("Invalid review submission", {
          errorCode: ERROR_CODES.unprocessableEntity,
          fieldErrors: zodFieldErrors(parsedBody.error)
        });
      }
      const payload = parsedBody.data;
      if (payload.assignment_id !== segments[1]) return forbidden("assignment_id must match route assignmentId", { errorCode: ERROR_CODES.forbidden });

      const result = store.submitReview({
        reviewerAgentId: agent.id,
        assignmentId: payload.assignment_id,
        paperVersionId: payload.paper_version_id,
        role: payload.role,
        guidelineVersionId: payload.guideline_version_id,
        recommendation: payload.recommendation,
        scores: payload.scores,
        summary: payload.summary,
        strengths: payload.strengths,
        weaknesses: payload.weaknesses,
        questions: payload.questions,
        findings: payload.findings,
        skillManifestHash: payload.skill_manifest_hash
      });
      if ("error" in result) return conflict(result.error ?? "Review submission failed", { errorCode: ERROR_CODES.conflict });
      return await respondIdempotent(req, agent.id, 201, result);
    }

    if (segments.length === 3 && segments[0] === "papers" && segments[2] === "reviews") {
      const paperId = segments[1];
      const paper = store.getPaper(paperId);
      if (!paper) return notFound("Paper not found", { errorCode: ERROR_CODES.reviewPaperVersionNotFound });

      const signed = await requireSignedAgentRequest(req, bodyText);
      if (!signed.ok) return signed.response;
      const agent = signed.agent;
      if (!agent) return badRequest("Unsigned dev mode requires X-Dev-Agent-Id for this endpoint", undefined, { errorCode: ERROR_CODES.badRequest });
      const signedRateLimit = applyCommonSignedWriteLimits(store, agent);
      if (signedRateLimit) return signedRateLimit;
      const dailyReviewLimit = applyRateLimit(
        store,
        `review:agent:${agent.id}:24h`,
        RATE_LIMITS.reviewCommentsPerAgent24h,
        "Review daily limit exceeded",
        ERROR_CODES.reviewRateLimitExceeded
      );
      if (dailyReviewLimit) return dailyReviewLimit;

      const replay = await maybeReplayIdempotency(req, agent.id);
      if (replay) return replay;

      const parsedBody = paperReviewCommentSubmissionSchema.safeParse(parseJsonBody<unknown>(bodyText || "{}"));
      if (!parsedBody.success) {
        return unprocessableEntity("Invalid paper review comment payload", {
          errorCode: pickReviewValidationCode(parsedBody.error),
          fieldErrors: zodFieldErrors(parsedBody.error)
        });
      }
      const payload = parsedBody.data;
      const paperCommentRateLimit = applyRateLimit(
        store,
        `comment:agent:${agent.id}:paper:${paperId}`,
        RATE_LIMITS.reviewCommentsPerAgentPaperPerHour,
        "Review comment rate exceeded for this paper",
        ERROR_CODES.reviewRateLimitExceeded
      );
      if (paperCommentRateLimit) return paperCommentRateLimit;

      const result = store.submitPaperReviewComment({
        paperId,
        paperVersionId: payload.paper_version_id,
        reviewerAgentId: agent.id,
        bodyMarkdown: payload.body_markdown,
        recommendation: payload.recommendation
      });
      if ("error" in result) {
        if (result.error === "Paper version not found") {
          return notFound("Paper version not found", { errorCode: ERROR_CODES.reviewPaperVersionNotFound });
        }
        if (result.error === "Review body too short") {
          return unprocessableEntity("Review body must be at least 200 characters", {
            errorCode: ERROR_CODES.reviewBodyTooShort
          });
        }
        if (result.error === "Review duplicate agent on version") {
          return conflict("Agent has already reviewed this paper version", {
            errorCode: ERROR_CODES.reviewDuplicateAgentOnVersion
          });
        }
        if (result.error === "Reviewer agent not active") {
          return forbidden("Reviewer agent is not active", { errorCode: ERROR_CODES.forbidden });
        }
        return conflict(result.error ?? "Failed to submit paper review comment", { errorCode: ERROR_CODES.conflict });
      }
      return await respondIdempotent(req, agent.id, 201, result);
    }

    if (segments.length === 4 && segments[0] === "operator" && segments[1] === "agents" && ["suspend", "reactivate"].includes(segments[3])) {
      const operator = requireOperator(req);
      if (!operator.ok) return operator.response;
      const parsedBody = operatorReasonSchema.safeParse(parseJsonBody<unknown>(bodyText || "{}"));
      if (!parsedBody.success) return badRequest("Invalid operator reason payload", parsedBody.error.flatten());
      const nextStatus = segments[3] === "suspend" ? "suspended" : "active";
      const updated = store.setAgentStatus(segments[2], nextStatus, parsedBody.data.reason_code, parsedBody.data.reason_text, "human_operator");
      if (!updated) return notFound("Agent not found");
      await persistRuntimeStore(store);
      return ok({ agent: updated });
    }

    if (segments.length === 4 && segments[0] === "operator" && segments[1] === "papers" && segments[3] === "quarantine") {
      const operator = requireOperator(req);
      if (!operator.ok) return operator.response;
      const parsedBody = operatorReasonSchema.safeParse(parseJsonBody<unknown>(bodyText || "{}"));
      if (!parsedBody.success) return badRequest("Invalid operator reason payload", parsedBody.error.flatten());
      const paper = store.quarantinePaper(segments[2], parsedBody.data.reason_code, parsedBody.data.reason_text);
      if (!paper) return notFound("Paper not found");
      await persistRuntimeStore(store);
      return ok({ paper });
    }

    if (segments.length === 4 && segments[0] === "operator" && segments[1] === "papers" && segments[3] === "force-reject") {
      const operator = requireOperator(req);
      if (!operator.ok) return operator.response;
      const parsedBody = operatorReasonSchema.safeParse(parseJsonBody<unknown>(bodyText || "{}"));
      if (!parsedBody.success) return badRequest("Invalid operator reason payload", parsedBody.error.flatten());
      const result = store.forceRejectPaper(segments[2], parsedBody.data.reason_code, parsedBody.data.reason_text);
      if (!result) return notFound("Paper not found");
      await persistRuntimeStore(store);
      return ok(result);
    }

    return notFound("Route not found");
  } catch (error) {
    if (error instanceof SkillManifestError) {
      return unprocessableEntity(error.message, { errorCode: ERROR_CODES.unprocessableEntity });
    }
    if (error instanceof SyntaxError) {
      return badRequest("Invalid JSON body", undefined, { errorCode: ERROR_CODES.badRequest });
    }
    return serverError("Internal server error", { errorCode: ERROR_CODES.internal });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const store = await getRuntimeStore();
    const segments = parseRouteSegments(req);

    if (segments.length === 3 && segments[0] === "assets" && segments[2] === "upload") {
      const assetId = segments[1];
      const uploadToken = req.nextUrl.searchParams.get("token") || "";
      if (!uploadToken) {
        return unauthorized("Missing upload token", { errorCode: ERROR_CODES.assetUploadUrlExpired });
      }
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
        return unprocessableEntity("PNG must be at most 1 MB", {
          errorCode: ERROR_CODES.assetTooLarge,
          fieldErrors: [{ field: "body", rule: "max", expected: MAX_ATTACHMENT_BYTES, actual: bytes.byteLength }]
        });
      }

      const uploaded = store.uploadAssetBinary({ assetId, uploadToken, bytes });
      if ("error" in uploaded) {
        if (uploaded.error === "Asset not found") {
          return notFound("Asset not found", { errorCode: ERROR_CODES.assetNotFound });
        }
        if (uploaded.error === "Asset upload token invalid" || uploaded.error === "Asset upload token expired") {
          return unauthorized("Upload URL is invalid or expired", { errorCode: ERROR_CODES.assetUploadUrlExpired });
        }
        if (uploaded.error === "Asset too large") {
          return unprocessableEntity("PNG must be at most 1 MB", { errorCode: ERROR_CODES.assetTooLarge });
        }
        return conflict(uploaded.error ?? "Asset upload failed", { errorCode: ERROR_CODES.conflict });
      }
      await persistRuntimeStore(store);
      return ok({ uploaded: true, asset: { id: uploaded.asset.id, status: uploaded.asset.status } });
    }

    return notFound("Route not found", { errorCode: ERROR_CODES.notFound });
  } catch {
    return serverError("Internal server error", { errorCode: ERROR_CODES.internal });
  }
}
