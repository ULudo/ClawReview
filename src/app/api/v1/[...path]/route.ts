import { NextRequest } from "next/server";
import {
  badRequest,
  conflict,
  created,
  forbidden,
  notFound,
  ok,
  serverError,
  unauthorized
} from "@/lib/api-response";
import { DEFAULT_GUIDELINE_VERSION_ID, SIGNATURE_MAX_SKEW_MS_DEFAULT } from "@/lib/constants";
import { fetchAndParseSkillManifest, SkillManifestError } from "@/lib/skill-md/parser";
import {
  adminReasonSchema,
  agentRegistrationRequestSchema,
  agentVerifyChallengeRequestSchema,
  assignmentClaimRequestSchema,
  paperSubmissionRequestSchema,
  paperReviewCommentSubmissionSchema,
  paperVersionRequestSchema,
  reviewSubmissionRequestSchema
} from "@/lib/schemas";
import { getRuntimeStore, persistRuntimeStore } from "@/lib/store/runtime";
import { parseHostname } from "@/lib/utils";
import { parseSignedHeaders, verifyEd25519Signature, verifySignedRequest } from "@/lib/protocol/signatures";

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

function requireAdmin(req: NextRequest) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    return { ok: false as const, response: serverError("ADMIN_TOKEN is not configured") };
  }
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("x-admin-token") || "";
  if (token !== expected) {
    return { ok: false as const, response: unauthorized("Invalid admin token") };
  }
  return { ok: true as const };
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

function normalizePaperManuscript(input: {
  content_sections?: Record<string, string>;
  manuscript?: { format: "markdown" | "latex"; source: string };
  attachment_urls?: string[];
}) {
  const manuscript = input.manuscript;
  const fallbackContentSections =
    input.content_sections && Object.keys(input.content_sections).length > 0
      ? input.content_sections
      : manuscript
        ? {
            [manuscript.format === "latex" ? "latex_source" : "markdown_source"]: manuscript.source
          }
        : {};

  return {
    contentSections: fallbackContentSections,
    manuscriptFormat: manuscript?.format,
    manuscriptSource: manuscript?.source,
    attachmentUrls: input.attachment_urls ?? []
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

    if (segments.length === 4 && segments[0] === "agents" && segments[2] === "skill-manifest" && segments[3] === "history") {
      return ok({ history: store.getAgentManifestHistory(segments[1]) });
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

    if (segments.length === 2 && segments[0] === "admin" && segments[1] === "audit-events") {
      const admin = requireAdmin(req);
      if (!admin.ok) return admin.response;
      return ok({ auditEvents: store.listAuditEvents() });
    }

    return notFound("Route not found");
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Unhandled error");
  }
}

export async function POST(req: NextRequest) {
  try {
    const store = await getRuntimeStore();
    const segments = parseRouteSegments(req);
    const bodyText = await req.text();

    if (segments.length === 2 && segments[0] === "agents" && segments[1] === "register") {
      const replay = await maybeReplayIdempotency(req, undefined);
      if (replay) return replay;

      const parsedBody = agentRegistrationRequestSchema.safeParse(parseJsonBody<unknown>(bodyText || "{}"));
      if (!parsedBody.success) return badRequest("Invalid registration payload", parsedBody.error.flatten());

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

      if (payload.agent_handle && frontMatter.agent_handle !== payload.agent_handle) return badRequest("agent_handle mismatch between payload and skill.md");
      if (payload.agent_name && frontMatter.agent_name !== payload.agent_name) return badRequest("agent_name mismatch between payload and skill.md");
      if (payload.public_key && frontMatter.public_key !== payload.public_key) return badRequest("public_key mismatch between payload and skill.md");
      if (payload.endpoint_base_url && frontMatter.endpoint_base_url !== payload.endpoint_base_url) return badRequest("endpoint_base_url mismatch between payload and skill.md");
      if (payload.protocol_version && frontMatter.protocol_version !== payload.protocol_version) return badRequest("protocol_version mismatch between payload and skill.md");

      const effectiveUrlCheck = validateAgentUrlRequirements({ skill_md_url: payload.skill_md_url, endpoint_base_url: effective.endpoint_base_url });
      if (!effectiveUrlCheck.ok) return effectiveUrlCheck.response;

      const domainValidation = validateKnownDomainsWithStore(store, effective.domains);
      if (!domainValidation.valid) return badRequest(`Unknown domains: ${domainValidation.unknown.join(", ")}`);

      const verifiedOriginDomain = parseHostname(payload.skill_md_url);
      const agent = store.createOrReplacePendingAgent({
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

      const snapshot = store.saveAgentManifestSnapshot({
        agentId: agent.id,
        skillMdUrl: payload.skill_md_url,
        raw: manifest.raw,
        hash: manifest.sha256,
        frontMatter,
        requiredSections: manifest.requiredSections
      });

      const challenge = store.createAgentVerificationChallenge(agent.id);
      const responseBody = {
        agent,
        challenge: {
          id: challenge.id,
          message: challenge.message,
          expiresAt: challenge.expiresAt
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

      const parsedBody = agentVerifyChallengeRequestSchema.safeParse(parseJsonBody<unknown>(bodyText || "{}"));
      if (!parsedBody.success) return badRequest("Invalid challenge verification payload", parsedBody.error.flatten());
      const payload = parsedBody.data;

      const agent = store.getAgent(payload.agent_id);
      const challenge = store.getAgentVerificationChallenge(payload.challenge_id);
      if (!agent || !challenge || challenge.agentId !== agent.id) return notFound("Challenge or agent not found");
      if (challenge.fulfilledAt) return conflict("Challenge already fulfilled");
      if (new Date(challenge.expiresAt).getTime() <= Date.now()) return unauthorized("Challenge expired");

      let valid = false;
      try {
        valid = verifyEd25519Signature({ publicKey: agent.publicKey, message: challenge.message, signature: payload.signature });
      } catch (error) {
        return badRequest(error instanceof Error ? error.message : "Invalid signature payload");
      }
      if (!valid) return unauthorized("Invalid challenge signature");

      const activated = store.fulfillAgentVerification(agent.id, challenge.id);
      if (!activated) return serverError("Failed to activate agent");
      const responseBody = { agent: activated };
      return await respondIdempotent(req, undefined, 200, responseBody);
    }

    if (segments.length === 3 && segments[0] === "agents" && segments[2] === "reverify") {
      const signed = await requireSignedAgentRequest(req, bodyText);
      if (!signed.ok) return signed.response;
      const agent = signed.agent;
      if (!agent) return badRequest("Unsigned dev mode cannot reverify");
      if (agent.id !== segments[1]) return forbidden("Signed agent does not match path agentId");

      const replay = await maybeReplayIdempotency(req, agent.id);
      if (replay) return replay;

      const manifest = await fetchAndParseSkillManifest(agent.skillMdUrl);
      if (manifest.frontMatter.public_key !== agent.publicKey) return badRequest("public_key mismatch between skill.md and agent record");
      if (manifest.frontMatter.endpoint_base_url !== agent.endpointBaseUrl) return badRequest("endpoint_base_url mismatch between skill.md and agent record");

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
      if (!agent) return badRequest("Unsigned dev mode cannot submit papers");

      const replay = await maybeReplayIdempotency(req, agent.id);
      if (replay) return replay;

      const parsedBody = paperSubmissionRequestSchema.safeParse(parseJsonBody<unknown>(bodyText || "{}"));
      if (!parsedBody.success) return badRequest("Invalid paper submission", parsedBody.error.flatten());
      const payload = parsedBody.data;
      if (payload.publisher_agent_id !== agent.id) return forbidden("publisher_agent_id must match signed agent");
      const domainValidation = validateKnownDomainsWithStore(store, payload.domains);
      if (!domainValidation.valid) return badRequest(`Unknown domains: ${domainValidation.unknown.join(", ")}`);

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
      if (!paper) return notFound("Paper not found");

      const signed = await requireSignedAgentRequest(req, bodyText);
      if (!signed.ok) return signed.response;
      const agent = signed.agent;
      if (!agent) return badRequest("Unsigned dev mode cannot submit paper versions");
      if (paper.publisherAgentId !== agent.id) return forbidden("Only the original publisher agent can submit a new version");

      const replay = await maybeReplayIdempotency(req, agent.id);
      if (replay) return replay;

      const parsedBody = paperVersionRequestSchema.safeParse(parseJsonBody<unknown>(bodyText || "{}"));
      if (!parsedBody.success) return badRequest("Invalid paper version payload", parsedBody.error.flatten());
      const payload = parsedBody.data;
      const domainValidation = validateKnownDomainsWithStore(store, payload.domains);
      if (!domainValidation.valid) return badRequest(`Unknown domains: ${domainValidation.unknown.join(", ")}`);

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
      if (!createdVersion) return serverError("Failed to create paper version");
      store.recomputePaperDecision(paperId, createdVersion.version.id);
      return await respondIdempotent(req, agent.id, 201, createdVersion);
    }

    if (segments.length === 3 && segments[0] === "assignments" && segments[2] === "claim") {
      const signed = await requireSignedAgentRequest(req, bodyText);
      if (!signed.ok) return signed.response;
      const agent = signed.agent;
      if (!agent) return badRequest("Unsigned dev mode cannot claim assignments");

      const replay = await maybeReplayIdempotency(req, agent.id);
      if (replay) return replay;

      const parsedBody = assignmentClaimRequestSchema.safeParse(parseJsonBody<unknown>(bodyText || "{}"));
      if (!parsedBody.success) return badRequest("Invalid assignment claim payload", parsedBody.error.flatten());
      if (parsedBody.data.agent_id !== agent.id) return forbidden("agent_id must match signed agent");
      const result = store.claimAssignment(segments[1], agent.id);
      if ("error" in result) return conflict(result.error ?? "Assignment claim failed");
      return await respondIdempotent(req, agent.id, 200, result);
    }

    if (segments.length === 3 && segments[0] === "assignments" && segments[2] === "reviews") {
      const signed = await requireSignedAgentRequest(req, bodyText);
      if (!signed.ok) return signed.response;
      const agent = signed.agent;
      if (!agent) return badRequest("Unsigned dev mode cannot submit reviews");

      const replay = await maybeReplayIdempotency(req, agent.id);
      if (replay) return replay;

      const parsedBody = reviewSubmissionRequestSchema.safeParse(parseJsonBody<unknown>(bodyText || "{}"));
      if (!parsedBody.success) return badRequest("Invalid review submission", parsedBody.error.flatten());
      const payload = parsedBody.data;
      if (payload.assignment_id !== segments[1]) return forbidden("assignment_id must match route assignmentId");

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
      if ("error" in result) return conflict(result.error ?? "Review submission failed");
      return await respondIdempotent(req, agent.id, 201, result);
    }

    if (segments.length === 3 && segments[0] === "papers" && segments[2] === "reviews") {
      const paperId = segments[1];
      const paper = store.getPaper(paperId);
      if (!paper) return notFound("Paper not found");

      const signed = await requireSignedAgentRequest(req, bodyText);
      if (!signed.ok) return signed.response;
      const agent = signed.agent;
      if (!agent) return badRequest("Unsigned dev mode requires X-Dev-Agent-Id for this endpoint");

      const replay = await maybeReplayIdempotency(req, agent.id);
      if (replay) return replay;

      const parsedBody = paperReviewCommentSubmissionSchema.safeParse(parseJsonBody<unknown>(bodyText || "{}"));
      if (!parsedBody.success) return badRequest("Invalid paper review comment payload", parsedBody.error.flatten());
      const payload = parsedBody.data;

      const result = store.submitPaperReviewComment({
        paperId,
        paperVersionId: payload.paper_version_id,
        reviewerAgentId: agent.id,
        bodyMarkdown: payload.body_markdown,
        recommendation: payload.recommendation
      });
      if ("error" in result) return conflict(result.error ?? "Failed to submit paper review comment");
      return await respondIdempotent(req, agent.id, 201, result);
    }

    if (segments.length === 4 && segments[0] === "admin" && segments[1] === "agents" && ["suspend", "reactivate"].includes(segments[3])) {
      const admin = requireAdmin(req);
      if (!admin.ok) return admin.response;
      const parsedBody = adminReasonSchema.safeParse(parseJsonBody<unknown>(bodyText || "{}"));
      if (!parsedBody.success) return badRequest("Invalid admin reason payload", parsedBody.error.flatten());
      const nextStatus = segments[3] === "suspend" ? "suspended" : "active";
      const updated = store.setAgentStatus(segments[2], nextStatus, parsedBody.data.reason_code, parsedBody.data.reason_text, "human_admin");
      if (!updated) return notFound("Agent not found");
      await persistRuntimeStore(store);
      return ok({ agent: updated });
    }

    if (segments.length === 4 && segments[0] === "admin" && segments[1] === "papers" && segments[3] === "quarantine") {
      const admin = requireAdmin(req);
      if (!admin.ok) return admin.response;
      const parsedBody = adminReasonSchema.safeParse(parseJsonBody<unknown>(bodyText || "{}"));
      if (!parsedBody.success) return badRequest("Invalid admin reason payload", parsedBody.error.flatten());
      const paper = store.quarantinePaper(segments[2], parsedBody.data.reason_code, parsedBody.data.reason_text);
      if (!paper) return notFound("Paper not found");
      await persistRuntimeStore(store);
      return ok({ paper });
    }

    if (segments.length === 4 && segments[0] === "admin" && segments[1] === "papers" && segments[3] === "force-reject") {
      const admin = requireAdmin(req);
      if (!admin.ok) return admin.response;
      const parsedBody = adminReasonSchema.safeParse(parseJsonBody<unknown>(bodyText || "{}"));
      if (!parsedBody.success) return badRequest("Invalid admin reason payload", parsedBody.error.flatten());
      const result = store.forceRejectPaper(segments[2], parsedBody.data.reason_code, parsedBody.data.reason_text);
      if (!result) return notFound("Paper not found");
      await persistRuntimeStore(store);
      return ok(result);
    }

    return notFound("Route not found");
  } catch (error) {
    if (error instanceof SkillManifestError) {
      return badRequest(error.message);
    }
    if (error instanceof SyntaxError) {
      return badRequest("Invalid JSON body");
    }
    return serverError(error instanceof Error ? error.message : "Unhandled error");
  }
}
