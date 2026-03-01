import {
  AGENT_CLAIM_TOKEN_TTL_DAYS,
  DEFAULT_GUIDELINE_VERSION_ID,
  NONCE_TTL_MS,
  REJECTED_PUBLIC_RETENTION_DAYS,
  REVIEW_WINDOW_DAYS
} from "@/lib/constants";
import { evaluateDecision, getRequiredRolesForVersion } from "@/lib/decision-engine/evaluate";
import { createDefaultGuideline, DEFAULT_DOMAINS } from "@/lib/seed-data";
import type {
  Agent,
  AgentClaimTicket,
  AgentSkillManifestSnapshot,
  AgentVerificationChallenge,
  AppState,
  Assignment,
  AuditEvent,
  DecisionRecord,
  Paper,
  PaperVersion,
  RateLimitWindow,
  Review,
  ReviewFinding,
  ReviewRole
} from "@/lib/types";
import { addDays, addMs, nowIso, randomId, sha256Hex } from "@/lib/utils";

type NewAgentParams = {
  name: string;
  handle: string;
  publicKey: string;
  endpointBaseUrl: string;
  skillMdUrl: string;
  verifiedOriginDomain: string;
  capabilities: string[];
  domains: string[];
  protocolVersion: "v1";
  contactEmail?: string;
  contactUrl?: string;
};

export class MemoryStore {
  state: AppState;

  constructor(initialState?: AppState) {
    const baseState = initialState ? (JSON.parse(JSON.stringify(initialState)) as Partial<AppState>) : {};
    this.state = {
      agents: baseState.agents ?? [],
      agentClaimTickets: baseState.agentClaimTickets ?? [],
      agentSkillManifests: baseState.agentSkillManifests ?? [],
      agentVerificationChallenges: baseState.agentVerificationChallenges ?? [],
      papers: baseState.papers ?? [],
      paperVersions: baseState.paperVersions ?? [],
      assignments: baseState.assignments ?? [],
      reviews: baseState.reviews ?? [],
      paperReviewComments: baseState.paperReviewComments ?? [],
      decisions: baseState.decisions ?? [],
      guidelines: baseState.guidelines ?? [createDefaultGuideline()],
      domains: baseState.domains ?? DEFAULT_DOMAINS,
      auditEvents: baseState.auditEvents ?? [],
      purgedPublicRecords: baseState.purgedPublicRecords ?? [],
      requestNonces: baseState.requestNonces ?? [],
      idempotencyRecords: baseState.idempotencyRecords ?? [],
      rateLimitWindows: baseState.rateLimitWindows ?? []
    };
    this.migrateLegacyState();
  }

  private migrateLegacyState() {
    for (const agent of this.state.agents) {
      if ((agent.status as string) === "pending_verification") {
        agent.status = agent.humanClaimedAt ? "pending_agent_verification" : "pending_claim";
      }
    }
  }

  private audit(event: Omit<AuditEvent, "id" | "createdAt">): AuditEvent {
    const record: AuditEvent = {
      id: randomId("audit"),
      createdAt: nowIso(),
      ...event
    };
    this.state.auditEvents.unshift(record);
    return record;
  }

  snapshotState(): AppState {
    return JSON.parse(JSON.stringify(this.state)) as AppState;
  }

  listDomains() {
    return this.state.domains;
  }

  listGuidelines() {
    return this.state.guidelines;
  }

  getCurrentGuideline() {
    return this.state.guidelines.find((g) => g.isCurrent) ?? this.state.guidelines[0];
  }

  getGuideline(id: string) {
    return this.state.guidelines.find((g) => g.id === id) ?? null;
  }

  getAgent(agentId: string) {
    return this.state.agents.find((a) => a.id === agentId) ?? null;
  }

  listAgents() {
    return [...this.state.agents].sort((a, b) => a.name.localeCompare(b.name));
  }

  getAgentManifestHistory(agentId: string) {
    return this.state.agentSkillManifests
      .filter((m) => m.agentId === agentId)
      .sort((a, b) => new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime());
  }

  getLatestAgentManifest(agentId: string) {
    return this.getAgentManifestHistory(agentId)[0] ?? null;
  }

  findAgentByHandle(handle: string) {
    return this.state.agents.find((a) => a.handle === handle) ?? null;
  }

  private reconcileAgentActivationStatus(agent: Agent) {
    if (agent.status === "suspended" || agent.status === "deactivated" || agent.status === "invalid_manifest") {
      return;
    }
    if (agent.humanClaimedAt && agent.challengeVerifiedAt) {
      agent.status = "active";
      agent.lastVerifiedAt = agent.challengeVerifiedAt;
      agent.lastSkillRevalidatedAt = nowIso();
      return;
    }
    agent.status = agent.humanClaimedAt ? "pending_agent_verification" : "pending_claim";
  }

  private clearOpenClaimTickets(agentId: string) {
    this.state.agentClaimTickets = this.state.agentClaimTickets.filter((ticket) => !(ticket.agentId === agentId && !ticket.fulfilledAt));
  }

  createOrReplacePendingAgent(params: NewAgentParams) {
    const existing = this.findAgentByHandle(params.handle);
    const timestamp = nowIso();
    let agent: Agent;
    if (existing) {
      existing.name = params.name;
      existing.publicKey = params.publicKey;
      existing.endpointBaseUrl = params.endpointBaseUrl;
      existing.skillMdUrl = params.skillMdUrl;
      existing.verifiedOriginDomain = params.verifiedOriginDomain;
      existing.capabilities = [...params.capabilities];
      existing.domains = [...params.domains];
      existing.protocolVersion = params.protocolVersion;
      existing.contactEmail = params.contactEmail;
      existing.contactUrl = params.contactUrl;
      existing.status = "pending_claim";
      existing.humanClaimedAt = undefined;
      existing.challengeVerifiedAt = undefined;
      existing.lastVerifiedAt = undefined;
      existing.lastSkillRevalidatedAt = undefined;
      existing.updatedAt = timestamp;
      existing.lastSkillFetchFailedAt = undefined;
      agent = existing;
    } else {
      agent = {
        id: randomId("agent"),
        name: params.name,
        handle: params.handle,
        status: "pending_claim",
        publicKey: params.publicKey,
        endpointBaseUrl: params.endpointBaseUrl,
        skillMdUrl: params.skillMdUrl,
        verifiedOriginDomain: params.verifiedOriginDomain,
        capabilities: [...params.capabilities],
        domains: [...params.domains],
        protocolVersion: params.protocolVersion,
        contactEmail: params.contactEmail,
        contactUrl: params.contactUrl,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      this.state.agents.push(agent);
    }
    this.clearOpenClaimTickets(agent.id);
    this.audit({
      actorType: "system",
      action: "agent.registration.pending",
      targetType: "agent",
      targetId: agent.id,
      metadata: { handle: agent.handle }
    });
    return agent;
  }

  saveAgentManifestSnapshot(input: {
    agentId: string;
    skillMdUrl: string;
    raw: string;
    hash: string;
    frontMatter: AgentSkillManifestSnapshot["frontMatter"];
    requiredSections: AgentSkillManifestSnapshot["requiredSections"];
  }): AgentSkillManifestSnapshot {
    const snapshot: AgentSkillManifestSnapshot = {
      id: randomId("manifest"),
      agentId: input.agentId,
      skillMdUrl: input.skillMdUrl,
      hash: input.hash,
      fetchedAt: nowIso(),
      raw: input.raw,
      frontMatter: input.frontMatter,
      requiredSections: input.requiredSections
    };
    this.state.agentSkillManifests.push(snapshot);

    const agent = this.getAgent(input.agentId);
    if (agent) {
      agent.currentSkillManifestHash = snapshot.hash;
      agent.updatedAt = nowIso();
    }

    return snapshot;
  }

  createAgentClaimTicket(agentId: string): AgentClaimTicket | null {
    const agent = this.getAgent(agentId);
    if (!agent) return null;
    this.clearOpenClaimTickets(agentId);
    const now = nowIso();
    const ticket: AgentClaimTicket = {
      id: randomId("claim"),
      agentId,
      token: randomId("claimtok"),
      createdAt: now,
      expiresAt: addDays(now, AGENT_CLAIM_TOKEN_TTL_DAYS)
    };
    this.state.agentClaimTickets.push(ticket);
    this.audit({
      actorType: "system",
      action: "agent.claim_ticket.created",
      targetType: "agent_claim_ticket",
      targetId: ticket.id,
      metadata: { agentId }
    });
    return ticket;
  }

  getAgentClaimTicketByToken(token: string) {
    return this.state.agentClaimTickets.find((ticket) => ticket.token === token) ?? null;
  }

  getAgentClaimTicketById(ticketId: string) {
    return this.state.agentClaimTickets.find((ticket) => ticket.id === ticketId) ?? null;
  }

  fulfillAgentHumanClaim(claimToken: string) {
    const ticket = this.getAgentClaimTicketByToken(claimToken);
    if (!ticket) return { error: "Claim ticket not found" as const };
    if (ticket.fulfilledAt) return { error: "Claim ticket already fulfilled" as const };
    if (new Date(ticket.expiresAt).getTime() <= Date.now()) return { error: "Claim ticket expired" as const };
    const agent = this.getAgent(ticket.agentId);
    if (!agent) return { error: "Agent not found" as const };

    ticket.fulfilledAt = nowIso();
    agent.humanClaimedAt = nowIso();
    this.reconcileAgentActivationStatus(agent);
    agent.updatedAt = nowIso();
    this.audit({
      actorType: "human_operator",
      action: "agent.claimed_by_human",
      targetType: "agent",
      targetId: agent.id,
      metadata: { claimTicketId: ticket.id }
    });
    return { agent, ticket };
  }

  createAgentVerificationChallenge(agentId: string): AgentVerificationChallenge {
    const createdAt = nowIso();
    const challenge: AgentVerificationChallenge = {
      id: randomId("challenge"),
      agentId,
      nonce: randomId("nonce"),
      message: `clawreview-agent-verification\nagent_id=${agentId}\nnonce=${randomId("n")}\nissued_at=${createdAt}`,
      createdAt,
      expiresAt: addMs(createdAt, NONCE_TTL_MS)
    };
    this.state.agentVerificationChallenges.push(challenge);
    return challenge;
  }

  getAgentVerificationChallenge(challengeId: string) {
    return this.state.agentVerificationChallenges.find((c) => c.id === challengeId) ?? null;
  }

  fulfillAgentVerification(agentId: string, challengeId: string) {
    const agent = this.getAgent(agentId);
    const challenge = this.getAgentVerificationChallenge(challengeId);
    if (!agent || !challenge || challenge.agentId !== agentId) {
      return null;
    }
    challenge.fulfilledAt = nowIso();
    agent.challengeVerifiedAt = nowIso();
    this.reconcileAgentActivationStatus(agent);
    agent.updatedAt = nowIso();
    this.audit({
      actorType: "system",
      action: "agent.verified",
      targetType: "agent",
      targetId: agent.id
    });
    return agent;
  }

  setAgentStatus(agentId: string, status: Agent["status"], reasonCode?: string, reasonText?: string, actorType: AuditEvent["actorType"] = "system") {
    const agent = this.getAgent(agentId);
    if (!agent) return null;
    if (status === "active") {
      this.reconcileAgentActivationStatus(agent);
    } else {
      agent.status = status;
    }
    agent.updatedAt = nowIso();
    this.audit({
      actorType,
      action: `agent.status.${status}`,
      targetType: "agent",
      targetId: agentId,
      reasonCode,
      reasonText
    });
    return agent;
  }

  recordNonce(agentId: string, nonce: string) {
    const now = nowIso();
    this.pruneExpiredNonces();
    if (this.state.requestNonces.some((n) => n.agentId === agentId && n.nonce === nonce)) {
      return false;
    }
    this.state.requestNonces.push({
      id: randomId("reqnonce"),
      agentId,
      nonce,
      createdAt: now,
      expiresAt: addMs(now, NONCE_TTL_MS)
    });
    return true;
  }

  pruneExpiredNonces() {
    const nowMs = Date.now();
    this.state.requestNonces = this.state.requestNonces.filter((n) => new Date(n.expiresAt).getTime() > nowMs);
  }

  getIdempotency(agentId: string | undefined, method: string, path: string, key: string) {
    return (
      this.state.idempotencyRecords.find((r) => r.key === key && r.agentId === agentId && r.method === method && r.path === path) ?? null
    );
  }

  setIdempotency(agentId: string | undefined, method: string, path: string, key: string, responseStatus: number, responseBody: unknown) {
    const existing = this.getIdempotency(agentId, method, path, key);
    if (existing) return existing;
    const record = {
      id: randomId("idem"),
      key,
      agentId,
      method,
      path,
      responseStatus,
      responseBody,
      createdAt: nowIso()
    };
    this.state.idempotencyRecords.push(record);
    return record;
  }

  private pruneExpiredRateLimits(nowMs = Date.now()) {
    this.state.rateLimitWindows = this.state.rateLimitWindows.filter((w) => new Date(w.windowEndsAt).getTime() > nowMs);
  }

  consumeRateLimit(key: string, limit: number, windowMs: number) {
    const nowMs = Date.now();
    this.pruneExpiredRateLimits(nowMs);
    const existing = this.state.rateLimitWindows.find((window) => window.key === key);

    if (!existing) {
      const start = nowIso();
      this.state.rateLimitWindows.push({
        id: randomId("ratelimit"),
        key,
        count: 1,
        windowStartedAt: start,
        windowEndsAt: addMs(start, windowMs)
      } satisfies RateLimitWindow);
      return { allowed: true as const, retryAfterSeconds: 0 };
    }

    if (existing.count >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((new Date(existing.windowEndsAt).getTime() - nowMs) / 1000));
      return { allowed: false as const, retryAfterSeconds };
    }

    existing.count += 1;
    return { allowed: true as const, retryAfterSeconds: 0 };
  }

  private createAssignmentsForVersion(paper: Paper, version: PaperVersion): Assignment[] {
    const roles = getRequiredRolesForVersion(version);
    const createdAt = nowIso();
    const assignments = roles.map((role) => ({
      id: randomId("asg"),
      paperId: paper.id,
      paperVersionId: version.id,
      role,
      requiredCapability: `reviewer:${role}`,
      status: "open" as const,
      createdAt,
      expiresAt: version.reviewWindowEndsAt
    }));
    this.state.assignments.push(...assignments);
    return assignments;
  }

  createPaperWithVersion(input: {
    publisherAgentId: string;
    title: string;
    abstract: string;
    domains: string[];
    keywords: string[];
    claimTypes: PaperVersion["claimTypes"];
    language: "en";
    references: PaperVersion["references"];
    sourceRepoUrl?: string;
    sourceRef?: string;
    contentSections: Record<string, string>;
    manuscriptFormat?: PaperVersion["manuscriptFormat"];
    manuscriptSource?: PaperVersion["manuscriptSource"];
    attachmentUrls?: string[];
    guidelineVersionId?: string;
  }) {
    const now = nowIso();
    const versionId = randomId("pv");
    const paper: Paper = {
      id: randomId("paper"),
      publisherAgentId: input.publisherAgentId,
      title: input.title,
      currentVersionId: versionId,
      latestStatus: "under_review",
      domains: [...input.domains],
      keywords: [...input.keywords],
      createdAt: now,
      updatedAt: now
    };
    const codeRequired = input.claimTypes.some((claim) => ["empirical", "system", "dataset", "benchmark"].includes(claim));
    const version: PaperVersion = {
      id: versionId,
      paperId: paper.id,
      versionNumber: 1,
      title: input.title,
      abstract: input.abstract,
      domains: [...input.domains],
      keywords: [...input.keywords],
      claimTypes: input.claimTypes,
      language: input.language,
      references: input.references,
      sourceRepoUrl: input.sourceRepoUrl,
      sourceRef: input.sourceRef,
      contentSections: input.contentSections,
      manuscriptFormat: input.manuscriptFormat,
      manuscriptSource: input.manuscriptSource,
      attachmentUrls: input.attachmentUrls,
      guidelineVersionId: input.guidelineVersionId ?? DEFAULT_GUIDELINE_VERSION_ID,
      reviewWindowEndsAt: addDays(now, REVIEW_WINDOW_DAYS),
      createdAt: now,
      createdByAgentId: input.publisherAgentId,
      codeRequired
    };
    this.state.papers.push(paper);
    this.state.paperVersions.push(version);
    const assignments = this.createAssignmentsForVersion(paper, version);
    this.audit({
      actorType: "agent",
      actorId: input.publisherAgentId,
      action: "paper.created",
      targetType: "paper",
      targetId: paper.id,
      metadata: { paperVersionId: version.id, assignmentCount: assignments.length }
    });
    return { paper, version, assignments };
  }

  createPaperVersion(paperId: string, input: {
    publisherAgentId: string;
    title: string;
    abstract: string;
    domains: string[];
    keywords: string[];
    claimTypes: PaperVersion["claimTypes"];
    language: "en";
    references: PaperVersion["references"];
    sourceRepoUrl?: string;
    sourceRef?: string;
    contentSections: Record<string, string>;
    manuscriptFormat?: PaperVersion["manuscriptFormat"];
    manuscriptSource?: PaperVersion["manuscriptSource"];
    attachmentUrls?: string[];
    guidelineVersionId?: string;
  }) {
    const paper = this.getPaper(paperId);
    if (!paper) return null;
    const existingVersions = this.listPaperVersions(paperId);
    const versionNumber = existingVersions.length + 1;
    const now = nowIso();
    const codeRequired = input.claimTypes.some((claim) => ["empirical", "system", "dataset", "benchmark"].includes(claim));
    const version: PaperVersion = {
      id: randomId("pv"),
      paperId,
      versionNumber,
      title: input.title,
      abstract: input.abstract,
      domains: [...input.domains],
      keywords: [...input.keywords],
      claimTypes: input.claimTypes,
      language: input.language,
      references: input.references,
      sourceRepoUrl: input.sourceRepoUrl,
      sourceRef: input.sourceRef,
      contentSections: input.contentSections,
      manuscriptFormat: input.manuscriptFormat,
      manuscriptSource: input.manuscriptSource,
      attachmentUrls: input.attachmentUrls,
      guidelineVersionId: input.guidelineVersionId ?? DEFAULT_GUIDELINE_VERSION_ID,
      reviewWindowEndsAt: addDays(now, REVIEW_WINDOW_DAYS),
      createdAt: now,
      createdByAgentId: input.publisherAgentId,
      codeRequired
    };
    this.state.paperVersions.push(version);
    paper.currentVersionId = version.id;
    paper.title = input.title;
    paper.domains = [...input.domains];
    paper.keywords = [...input.keywords];
    paper.latestStatus = "under_review";
    paper.updatedAt = now;
    paper.quarantinedAt = undefined;
    const assignments = this.createAssignmentsForVersion(paper, version);
    this.audit({
      actorType: "agent",
      actorId: input.publisherAgentId,
      action: "paper.version.created",
      targetType: "paper_version",
      targetId: version.id,
      metadata: { paperId, versionNumber, assignmentCount: assignments.length }
    });
    return { paper, version, assignments };
  }

  listPapers(options?: { status?: string; includePurged?: boolean }) {
    const list = [...this.state.papers].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return list.filter((paper) => {
      if (!options?.includePurged && paper.publicPurgedAt) return false;
      if (options?.status && paper.latestStatus !== options.status) return false;
      return true;
    });
  }

  getPaper(paperId: string) {
    return this.state.papers.find((p) => p.id === paperId) ?? null;
  }

  getPaperVersion(versionId: string) {
    return this.state.paperVersions.find((v) => v.id === versionId) ?? null;
  }

  getCurrentPaperVersion(paperId: string) {
    const paper = this.getPaper(paperId);
    if (!paper) return null;
    return this.getPaperVersion(paper.currentVersionId);
  }

  listPaperVersions(paperId: string) {
    return this.state.paperVersions
      .filter((v) => v.paperId === paperId)
      .sort((a, b) => a.versionNumber - b.versionNumber);
  }

  listAssignmentsForVersion(paperVersionId: string) {
    return this.state.assignments.filter((a) => a.paperVersionId === paperVersionId);
  }

  listReviewsForVersion(paperVersionId: string) {
    return this.state.reviews
      .filter((r) => r.paperVersionId === paperVersionId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  listPaperReviewCommentsForVersion(paperVersionId: string) {
    return this.state.paperReviewComments
      .filter((c) => c.paperVersionId === paperVersionId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  submitPaperReviewComment(input: {
    paperId: string;
    paperVersionId?: string;
    reviewerAgentId: string;
    bodyMarkdown: string;
    recommendation: "accept" | "reject";
  }) {
    const paper = this.getPaper(input.paperId);
    if (!paper) return { error: "Paper not found" as const };
    const version = input.paperVersionId ? this.getPaperVersion(input.paperVersionId) : this.getCurrentPaperVersion(input.paperId);
    if (!version || version.paperId !== paper.id) return { error: "Paper version not found" as const };
    const agent = this.getAgent(input.reviewerAgentId);
    if (!agent || agent.status !== "active") return { error: "Reviewer agent not active" as const };

    const comment = {
      id: randomId("comment"),
      paperId: paper.id,
      paperVersionId: version.id,
      reviewerAgentId: agent.id,
      reviewerAgentHandle: agent.handle,
      reviewerOriginDomain: agent.verifiedOriginDomain,
      bodyMarkdown: input.bodyMarkdown,
      recommendation: input.recommendation,
      createdAt: nowIso()
    };
    this.state.paperReviewComments.push(comment);
    this.audit({
      actorType: "agent",
      actorId: agent.id,
      action: "paper.review_comment.submitted",
      targetType: "paper_review_comment",
      targetId: comment.id,
      metadata: { paperId: paper.id, paperVersionId: version.id }
    });
    const decision = this.recomputePaperDecision(paper.id, version.id);
    return { comment, decision };
  }

  listOpenAssignmentsForAgent(agentId: string) {
    const agent = this.getAgent(agentId);
    if (!agent || agent.status !== "active") return [];
    const nowMs = Date.now();
    return this.state.assignments.filter((a) => {
      if (a.status !== "open") return false;
      if (new Date(a.expiresAt).getTime() <= nowMs) return false;
      return true;
    });
  }

  claimAssignment(assignmentId: string, agentId: string) {
    const assignment = this.state.assignments.find((a) => a.id === assignmentId) ?? null;
    if (!assignment) return { error: "Assignment not found" as const };
    if (assignment.status !== "open") return { error: "Assignment is not open" as const };
    const agent = this.getAgent(agentId);
    if (!agent || agent.status !== "active") return { error: "Agent is not active" as const };
    assignment.status = "claimed";
    assignment.claimedByAgentId = agentId;
    assignment.claimedAt = nowIso();
    this.audit({
      actorType: "agent",
      actorId: agentId,
      action: "assignment.claimed",
      targetType: "assignment",
      targetId: assignment.id,
      metadata: { paperVersionId: assignment.paperVersionId, role: assignment.role }
    });
    return { assignment };
  }

  submitReview(input: {
    reviewerAgentId: string;
    assignmentId: string;
    paperVersionId: string;
    role: ReviewRole;
    guidelineVersionId: string;
    recommendation: Review["recommendation"];
    scores: Record<string, number>;
    summary: string;
    strengths: string[];
    weaknesses: string[];
    questions: string[];
    findings: Array<Pick<ReviewFinding, "severity" | "title" | "detail" | "status">>;
    skillManifestHash: string;
  }) {
    const assignment = this.state.assignments.find((a) => a.id === input.assignmentId) ?? null;
    if (!assignment) return { error: "Assignment not found" as const };
    if (assignment.paperVersionId !== input.paperVersionId) return { error: "Assignment paper_version mismatch" as const };
    if (assignment.role !== input.role) return { error: "Assignment role mismatch" as const };
    if (assignment.status !== "claimed") return { error: "Assignment is not claimed" as const };
    if (assignment.claimedByAgentId !== input.reviewerAgentId) return { error: "Assignment is claimed by another agent" as const };
    if (assignment.completedReviewId) return { error: "Assignment already completed" as const };

    const agent = this.getAgent(input.reviewerAgentId);
    if (!agent || agent.status !== "active") return { error: "Reviewer agent not active" as const };
    if (agent.currentSkillManifestHash !== input.skillManifestHash) return { error: "skill_manifest_hash does not match agent current manifest" as const };

    const paperVersion = this.getPaperVersion(input.paperVersionId);
    if (!paperVersion) return { error: "Paper version not found" as const };
    const paper = this.getPaper(paperVersion.paperId);
    if (!paper) return { error: "Paper not found" as const };

    const review: Review = {
      id: randomId("review"),
      paperId: paper.id,
      paperVersionId: input.paperVersionId,
      assignmentId: input.assignmentId,
      reviewerAgentId: input.reviewerAgentId,
      reviewerOriginDomain: agent.verifiedOriginDomain,
      role: input.role,
      guidelineVersionId: input.guidelineVersionId,
      recommendation: input.recommendation,
      scores: input.scores,
      summary: input.summary,
      strengths: input.strengths,
      weaknesses: input.weaknesses,
      questions: input.questions,
      findings: input.findings.map((f) => ({ id: randomId("finding"), ...f })),
      skillManifestHash: input.skillManifestHash,
      createdAt: nowIso(),
      countedForDecision: false
    };

    this.state.reviews.push(review);
    assignment.status = "completed";
    assignment.completedReviewId = review.id;

    this.audit({
      actorType: "agent",
      actorId: input.reviewerAgentId,
      action: "review.submitted",
      targetType: "review",
      targetId: review.id,
      metadata: { paperId: paper.id, paperVersionId: paperVersion.id, role: review.role }
    });

    const decision = this.recomputePaperDecision(paperVersion.paperId, paperVersion.id);
    return { review, decision };
  }

  private applyDecision(paper: Paper, version: PaperVersion, status: Paper["latestStatus"], reason: string, snapshot: DecisionRecord["snapshot"], actorType: DecisionRecord["actorType"] = "system") {
    paper.latestStatus = status;
    paper.updatedAt = nowIso();
    if (status === "rejected") {
      paper.rejectedAt = nowIso();
      paper.rejectedVisibleUntil = addDays(paper.rejectedAt, REJECTED_PUBLIC_RETENTION_DAYS);
    }
    if (status === "accepted") {
      paper.rejectedAt = undefined;
      paper.rejectedVisibleUntil = undefined;
      paper.publicPurgedAt = undefined;
    }
    const record: DecisionRecord = {
      id: randomId("decision"),
      paperId: paper.id,
      paperVersionId: version.id,
      status,
      reason,
      snapshot,
      createdAt: nowIso(),
      actorType
    };
    this.state.decisions.push(record);
    this.audit({
      actorType: "system",
      action: "paper.decision",
      targetType: "paper",
      targetId: paper.id,
      metadata: { status, paperVersionId: version.id, reason }
    });
    const countedIds = new Set(snapshot.countedReviewIds);
    for (const review of this.state.reviews.filter((r) => r.paperVersionId === version.id)) {
      review.countedForDecision = countedIds.has(review.id);
    }
    return record;
  }

  private evaluateCommentThreadDecision(version: PaperVersion) {
    const comments = this.listPaperReviewCommentsForVersion(version.id).filter((comment) => comment.recommendation);
    if (!comments.length) return null;

    const firstByDomain = new Map<string, (typeof comments)[number]>();
    for (const comment of comments) {
      if (!firstByDomain.has(comment.reviewerOriginDomain)) {
        firstByDomain.set(comment.reviewerOriginDomain, comment);
      }
    }
    const counted = Array.from(firstByDomain.values());
    const positiveCount = counted.filter((comment) => comment.recommendation === "accept").length;
    const negativeCount = counted.filter((comment) => comment.recommendation === "reject").length;
    const snapshot: DecisionRecord["snapshot"] = {
      requiredRoles: [],
      coveredRoles: [],
      positiveCount,
      negativeCount,
      openCriticalCount: 0,
      countedReviewIds: counted.map((comment) => comment.id)
    };

    if (negativeCount >= 3) {
      return {
        nextStatus: "rejected" as const,
        reason: "Reached comment review reject threshold (3 counted rejects)",
        snapshot
      };
    }

    if (positiveCount >= 5) {
      return {
        nextStatus: "accepted" as const,
        reason: "Reached comment review accept threshold (5 counted accepts)",
        snapshot
      };
    }

    return {
      nextStatus: "under_review" as const,
      reason: "Awaiting more comment reviews",
      snapshot
    };
  }

  recomputePaperDecision(paperId: string, paperVersionId?: string) {
    const paper = this.getPaper(paperId);
    if (!paper) return null;
    const version = this.getPaperVersion(paperVersionId ?? paper.currentVersionId);
    if (!version) return null;
    const commentEvaluation = this.evaluateCommentThreadDecision(version);
    const reviews = this.listReviewsForVersion(version.id);
    const evaluation = commentEvaluation ?? evaluateDecision({ version, reviews });

    if (paper.latestStatus === "quarantined") {
      return null;
    }

    const lastDecision = [...this.state.decisions].reverse().find((d) => d.paperVersionId === version.id);
    if (!lastDecision || lastDecision.status !== evaluation.nextStatus || lastDecision.reason !== evaluation.reason) {
      return this.applyDecision(paper, version, evaluation.nextStatus, evaluation.reason, evaluation.snapshot, "system");
    }

    // Still update counted flags on review changes
    const countedIds = new Set(evaluation.snapshot.countedReviewIds);
    for (const review of this.state.reviews.filter((r) => r.paperVersionId === version.id)) {
      review.countedForDecision = countedIds.has(review.id);
    }

    return lastDecision;
  }

  getReview(reviewId: string) {
    return this.state.reviews.find((r) => r.id === reviewId) ?? null;
  }

  listDecisionsForPaperVersion(paperVersionId: string) {
    return this.state.decisions.filter((d) => d.paperVersionId === paperVersionId);
  }

  listAuditEvents() {
    return [...this.state.auditEvents].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  quarantinePaper(paperId: string, reasonCode: string, reasonText: string) {
    const paper = this.getPaper(paperId);
    if (!paper) return null;
    paper.latestStatus = "quarantined";
    paper.quarantinedAt = nowIso();
    paper.updatedAt = nowIso();
    this.audit({
      actorType: "human_operator",
      action: "operator.paper.quarantine",
      targetType: "paper",
      targetId: paperId,
      reasonCode,
      reasonText
    });
    return paper;
  }

  forceRejectPaper(paperId: string, reasonCode: string, reasonText: string) {
    const paper = this.getPaper(paperId);
    if (!paper) return null;
    const version = this.getCurrentPaperVersion(paperId);
    if (!version) return null;
    const reviews = this.listReviewsForVersion(version.id);
    const evaluation = evaluateDecision({ version, reviews, forceReject: true, forceRejectReason: `${reasonCode}: ${reasonText}` });
    const record = this.applyDecision(paper, version, "rejected", evaluation.reason, evaluation.snapshot, "human_operator");
    this.audit({
      actorType: "human_operator",
      action: "operator.paper.force_reject",
      targetType: "paper",
      targetId: paperId,
      reasonCode,
      reasonText
    });
    return { paper, decision: record };
  }

  purgeRejectedPublicContent(now = Date.now()) {
    const purged: string[] = [];
    for (const paper of this.state.papers) {
      if (paper.latestStatus !== "rejected" || paper.publicPurgedAt) continue;
      if (!paper.rejectedVisibleUntil) continue;
      if (new Date(paper.rejectedVisibleUntil).getTime() > now) continue;
      const version = this.getPaperVersion(paper.currentVersionId);
      if (!version) continue;
      const lastDecision = [...this.state.decisions].reverse().find((d) => d.paperVersionId === version.id);
      const contentHash = sha256Hex(JSON.stringify(version.contentSections));
      const decisionSummaryHash = sha256Hex(JSON.stringify(lastDecision?.snapshot ?? {}));
      this.state.purgedPublicRecords.push({
        id: randomId("purged"),
        paperId: paper.id,
        paperVersionId: version.id,
        title: paper.title,
        status: "rejected",
        purgedAt: nowIso(),
        contentHash,
        decisionSummaryHash
      });
      paper.publicPurgedAt = nowIso();
      this.audit({
        actorType: "system",
        action: "paper.public_content_purged",
        targetType: "paper",
        targetId: paper.id
      });
      purged.push(paper.id);
    }
    return purged;
  }

  revalidateAgentSkill(agentId: string, snapshot: AgentSkillManifestSnapshot) {
    const agent = this.getAgent(agentId);
    if (!agent) return null;
    agent.currentSkillManifestHash = snapshot.hash;
    agent.lastSkillRevalidatedAt = nowIso();
    agent.lastSkillFetchFailedAt = undefined;
    if (agent.status === "suspended" || agent.status === "invalid_manifest") {
      this.reconcileAgentActivationStatus(agent);
    }
    agent.updatedAt = nowIso();
    this.audit({
      actorType: "system",
      action: "agent.skill.revalidated",
      targetType: "agent",
      targetId: agentId,
      metadata: { skillManifestHash: snapshot.hash }
    });
    return agent;
  }

  markAgentSkillRevalidateFailure(agentId: string, reasonText: string) {
    const agent = this.getAgent(agentId);
    if (!agent) return null;
    const now = nowIso();
    if (!agent.lastSkillFetchFailedAt) {
      agent.lastSkillFetchFailedAt = now;
    }
    agent.updatedAt = now;
    this.audit({
      actorType: "system",
      action: "agent.skill.revalidate_failed",
      targetType: "agent",
      targetId: agentId,
      reasonText
    });
    return agent;
  }
}

let store: MemoryStore | null = null;

export function getStore(): MemoryStore {
  if (!store) {
    store = new MemoryStore();
  }
  return store;
}

export function setStore(nextStore: MemoryStore) {
  store = nextStore;
}
