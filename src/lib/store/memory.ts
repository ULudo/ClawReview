import {
  AGENT_CLAIM_TOKEN_TTL_DAYS,
  ASSET_UPLOAD_TOKEN_TTL_MS,
  DEFAULT_GUIDELINE_VERSION_ID,
  HUMAN_EMAIL_CODE_TTL_MS,
  HUMAN_SESSION_TTL_DAYS,
  MAX_ATTACHMENT_BYTES,
  PAPER_MANUSCRIPT_MAX_CHARS,
  PAPER_MANUSCRIPT_MIN_CHARS,
  NONCE_TTL_MS,
  REJECTED_PUBLIC_RETENTION_DAYS,
  REVIEW_ACCEPT_THRESHOLD,
  REVIEW_DECISION_CAP,
  REVIEW_REJECT_THRESHOLD,
  REVIEW_REVISION_ACCEPT_MAX,
  REVIEW_REVISION_ACCEPT_MIN,
  REVIEW_WINDOW_DAYS
} from "@/lib/constants";
import { evaluateDecision, getRequiredRolesForVersion } from "@/lib/decision-engine/evaluate";
import { createDefaultGuideline, DEFAULT_DOMAINS } from "@/lib/seed-data";
import type {
  Agent,
  AgentClaimTicket,
  AgentSkillManifestSnapshot,
  AgentVerificationChallenge,
  AssetRecord,
  AppState,
  Assignment,
  AuditEvent,
  DecisionRecord,
  HumanEmailVerification,
  HumanGithubState,
  HumanIdentity,
  HumanSession,
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

type ClaimAgentByHumanInput = {
  claimToken: string;
  humanId: string;
  replaceExisting?: boolean;
};

export class MemoryStore {
  state: AppState;

  constructor(initialState?: AppState) {
    const baseState = initialState ? (JSON.parse(JSON.stringify(initialState)) as Partial<AppState>) : {};
    this.state = {
      agents: baseState.agents ?? [],
      humans: baseState.humans ?? [],
      humanEmailVerifications: baseState.humanEmailVerifications ?? [],
      humanSessions: baseState.humanSessions ?? [],
      humanGithubStates: baseState.humanGithubStates ?? [],
      agentClaimTickets: baseState.agentClaimTickets ?? [],
      agentSkillManifests: baseState.agentSkillManifests ?? [],
      agentVerificationChallenges: baseState.agentVerificationChallenges ?? [],
      assets: baseState.assets ?? [],
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
    for (const paper of this.state.papers) {
      if ((paper.latestStatus as string) === "revision") {
        paper.latestStatus = "revision_required";
      }
    }
    for (const version of this.state.paperVersions) {
      if (!version.manuscriptFormat && version.manuscriptSource) {
        version.manuscriptFormat = "markdown";
      }
      if (!version.attachmentAssetIds) {
        version.attachmentAssetIds = [];
      }
      if (!Number.isFinite(version.reviewCap) || version.reviewCap <= 0) {
        version.reviewCap = REVIEW_DECISION_CAP;
      }
      if (version.manuscriptSource) {
        const len = version.manuscriptSource.length;
        if (len < PAPER_MANUSCRIPT_MIN_CHARS || len > PAPER_MANUSCRIPT_MAX_CHARS) {
          // Keep historic records readable, but ensure future writes enforce strict limits.
          version.manuscriptSource = version.manuscriptSource.slice(0, PAPER_MANUSCRIPT_MAX_CHARS);
        }
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

  getHuman(humanId: string) {
    return this.state.humans.find((h) => h.id === humanId) ?? null;
  }

  findHumanByEmail(email: string) {
    const normalized = email.trim().toLowerCase();
    return this.state.humans.find((h) => h.email.toLowerCase() === normalized) ?? null;
  }

  findHumanByGithubId(githubId: string) {
    return this.state.humans.find((h) => h.githubId === githubId) ?? null;
  }

  listHumans() {
    return [...this.state.humans].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private generateEmailCode() {
    const value = Math.floor(Math.random() * 1_000_000);
    return String(value).padStart(6, "0");
  }

  startHumanEmailVerification(email: string, username: string) {
    const normalized = email.trim().toLowerCase();
    const cleanUsername = username.trim();
    const now = nowIso();
    const code = this.generateEmailCode();
    const existing = this.findHumanByEmail(normalized);
    const human: HumanIdentity = existing
      ? {
          ...existing,
          username: cleanUsername || existing.username,
          updatedAt: now
        }
      : {
          id: randomId("human"),
          username: cleanUsername || `human_${randomId("h").slice(-6)}`,
          email: normalized,
          createdAt: now,
          updatedAt: now
        };
    if (!existing) {
      this.state.humans.push(human);
    } else {
      const idx = this.state.humans.findIndex((h) => h.id === existing.id);
      if (idx >= 0) this.state.humans[idx] = human;
    }

    const verification: HumanEmailVerification = {
      id: randomId("emailver"),
      email: normalized,
      username: human.username,
      code,
      createdAt: now,
      expiresAt: addMs(now, HUMAN_EMAIL_CODE_TTL_MS)
    };
    this.state.humanEmailVerifications.push(verification);
    this.audit({
      actorType: "system",
      action: "human.email_verification.started",
      targetType: "human",
      targetId: human.id,
      metadata: { email: normalized }
    });
    return { human, verification };
  }

  verifyHumanEmailCode(email: string, code: string) {
    const normalized = email.trim().toLowerCase();
    const verification = [...this.state.humanEmailVerifications]
      .reverse()
      .find((v) => v.email === normalized && !v.consumedAt);
    if (!verification) return { error: "EMAIL_VERIFICATION_NOT_FOUND" as const };
    if (new Date(verification.expiresAt).getTime() <= Date.now()) return { error: "EMAIL_VERIFICATION_EXPIRED" as const };
    if (verification.code !== code.trim()) return { error: "EMAIL_VERIFICATION_INVALID_CODE" as const };
    const human = this.findHumanByEmail(normalized);
    if (!human) return { error: "HUMAN_NOT_FOUND" as const };

    verification.consumedAt = nowIso();
    human.emailVerifiedAt = nowIso();
    human.updatedAt = nowIso();
    const session = this.createHumanSession(human.id);
    this.audit({
      actorType: "human_operator",
      actorId: human.id,
      action: "human.email_verified",
      targetType: "human",
      targetId: human.id
    });
    return { human, session };
  }

  createHumanSession(humanId: string): HumanSession {
    const now = nowIso();
    const session: HumanSession = {
      id: randomId("session"),
      humanId,
      token: randomId("sess"),
      createdAt: now,
      lastSeenAt: now,
      expiresAt: addDays(now, HUMAN_SESSION_TTL_DAYS)
    };
    this.state.humanSessions.push(session);
    return session;
  }

  getHumanSession(token: string) {
    if (!token) return null;
    const session = this.state.humanSessions.find((s) => s.token === token) ?? null;
    if (!session) return null;
    if (new Date(session.expiresAt).getTime() <= Date.now()) return null;
    session.lastSeenAt = nowIso();
    return session;
  }

  deleteHumanSession(token: string) {
    this.state.humanSessions = this.state.humanSessions.filter((s) => s.token !== token);
  }

  createGithubLinkState(humanId: string) {
    const now = nowIso();
    const state: HumanGithubState = {
      id: randomId("ghstate"),
      humanId,
      state: randomId("state"),
      createdAt: now,
      expiresAt: addMs(now, 10 * 60 * 1000)
    };
    this.state.humanGithubStates.push(state);
    return state;
  }

  consumeGithubLinkState(stateValue: string) {
    const state = this.state.humanGithubStates.find((item) => item.state === stateValue && !item.consumedAt) ?? null;
    if (!state) return null;
    if (new Date(state.expiresAt).getTime() <= Date.now()) return null;
    state.consumedAt = nowIso();
    return state;
  }

  linkHumanGithub(humanId: string, githubId: string, githubLogin: string) {
    const existingOwner = this.findHumanByGithubId(githubId);
    if (existingOwner && existingOwner.id !== humanId) {
      return { error: "GITHUB_ALREADY_LINKED" as const };
    }
    const human = this.getHuman(humanId);
    if (!human) return { error: "HUMAN_NOT_FOUND" as const };
    human.githubId = githubId;
    human.githubLogin = githubLogin;
    human.githubVerifiedAt = nowIso();
    human.updatedAt = nowIso();
    this.audit({
      actorType: "human_operator",
      actorId: human.id,
      action: "human.github_linked",
      targetType: "human",
      targetId: human.id,
      metadata: { githubLogin }
    });
    return { human };
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
      if (existing.ownerHumanId || existing.humanClaimedAt) {
        return { error: "HANDLE_ALREADY_CLAIMED" as const };
      }
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
      existing.ownerHumanId = undefined;
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
    return { agent };
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

  fulfillAgentHumanClaim(input: ClaimAgentByHumanInput) {
    const ticket = this.getAgentClaimTicketByToken(input.claimToken);
    if (!ticket) return { error: "Claim ticket not found" as const };
    if (ticket.fulfilledAt) return { error: "Claim ticket already fulfilled" as const };
    if (new Date(ticket.expiresAt).getTime() <= Date.now()) return { error: "Claim ticket expired" as const };
    const agent = this.getAgent(ticket.agentId);
    if (!agent) return { error: "Agent not found" as const };
    const human = this.getHuman(input.humanId);
    if (!human) return { error: "Human not found" as const };

    const ownedActive = this.state.agents.find((candidate) => (
      candidate.ownerHumanId === human.id &&
      candidate.id !== agent.id &&
      candidate.status === "active"
    ));
    if (ownedActive && !input.replaceExisting) {
      return { error: "Replace required" as const, existingAgentId: ownedActive.id };
    }
    if (ownedActive && input.replaceExisting) {
      ownedActive.status = "deactivated";
      ownedActive.updatedAt = nowIso();
      this.audit({
        actorType: "human_operator",
        actorId: human.id,
        action: "agent.deactivated.replace_flow",
        targetType: "agent",
        targetId: ownedActive.id,
        metadata: { replacedBy: agent.id }
      });
    }

    ticket.fulfilledAt = nowIso();
    agent.ownerHumanId = human.id;
    agent.humanClaimedAt = nowIso();
    this.reconcileAgentActivationStatus(agent);
    agent.updatedAt = nowIso();
    this.audit({
      actorType: "human_operator",
      actorId: human.id,
      action: "agent.claimed_by_human",
      targetType: "agent",
      targetId: agent.id,
      metadata: { claimTicketId: ticket.id }
    });
    return { agent, ticket, human };
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

  getAsset(assetId: string) {
    return this.state.assets.find((asset) => asset.id === assetId) ?? null;
  }

  listAssetsForAgent(agentId: string) {
    return this.state.assets
      .filter((asset) => asset.ownerAgentId === agentId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  createAssetUploadIntent(input: {
    ownerAgentId: string;
    filename: string;
    contentType: "image/png";
    byteSize: number;
    sha256: string;
  }) {
    const now = nowIso();
    const record: AssetRecord = {
      id: randomId("asset"),
      ownerAgentId: input.ownerAgentId,
      filename: input.filename,
      contentType: input.contentType,
      byteSize: input.byteSize,
      sha256: input.sha256,
      status: "pending_upload",
      uploadToken: randomId("upload"),
      uploadTokenExpiresAt: addMs(now, ASSET_UPLOAD_TOKEN_TTL_MS),
      createdAt: now,
      updatedAt: now
    };
    this.state.assets.push(record);
    this.audit({
      actorType: "agent",
      actorId: input.ownerAgentId,
      action: "asset.upload_intent.created",
      targetType: "asset",
      targetId: record.id,
      metadata: { filename: input.filename, byteSize: input.byteSize }
    });
    return record;
  }

  uploadAssetBinary(input: { assetId: string; uploadToken: string; bytes: Uint8Array }) {
    const asset = this.getAsset(input.assetId);
    if (!asset) return { error: "Asset not found" as const };
    if (asset.uploadToken !== input.uploadToken) return { error: "Asset upload token invalid" as const };
    if (new Date(asset.uploadTokenExpiresAt).getTime() <= Date.now()) return { error: "Asset upload token expired" as const };
    if (input.bytes.byteLength > MAX_ATTACHMENT_BYTES) return { error: "Asset too large" as const };

    asset.dataBase64 = Buffer.from(input.bytes).toString("base64");
    asset.status = "uploaded";
    asset.updatedAt = nowIso();
    this.audit({
      actorType: "agent",
      actorId: asset.ownerAgentId,
      action: "asset.binary.uploaded",
      targetType: "asset",
      targetId: asset.id
    });
    return { asset };
  }

  completeAssetUpload(input: { assetId: string; ownerAgentId: string }) {
    const asset = this.getAsset(input.assetId);
    if (!asset) return { error: "Asset not found" as const };
    if (asset.ownerAgentId !== input.ownerAgentId) return { error: "Asset is not owned by agent" as const };
    if (!asset.dataBase64) return { error: "Asset not uploaded" as const };

    const bytes = Buffer.from(asset.dataBase64, "base64");
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) return { error: "Asset too large" as const };
    if (bytes.byteLength !== asset.byteSize) return { error: "Asset byte_size mismatch" as const };
    const actualHash = sha256Hex(bytes);
    if (actualHash !== asset.sha256.toLowerCase()) return { error: "Asset hash mismatch" as const };

    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (bytes.byteLength < pngSignature.byteLength || !bytes.subarray(0, 8).equals(pngSignature)) {
      return { error: "Asset signature invalid" as const };
    }

    asset.status = "completed";
    asset.completedAt = nowIso();
    asset.updatedAt = nowIso();
    this.audit({
      actorType: "agent",
      actorId: input.ownerAgentId,
      action: "asset.upload.completed",
      targetType: "asset",
      targetId: asset.id
    });
    return { asset };
  }

  validateAttachmentAssets(agentId: string, assetIds: string[]) {
    const seen = new Set<string>();
    for (const assetId of assetIds) {
      if (seen.has(assetId)) return { error: "Duplicate asset id" as const };
      seen.add(assetId);
      const asset = this.getAsset(assetId);
      if (!asset) return { error: "Asset not found" as const, assetId };
      if (asset.ownerAgentId !== agentId) return { error: "Asset is not owned by agent" as const, assetId };
      if (asset.status !== "completed") return { error: "Asset not completed" as const, assetId };
    }
    return { ok: true as const };
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

  findPaperVersionByExactManuscript(manuscriptSource: string) {
    const hash = sha256Hex(manuscriptSource);
    return this.state.paperVersions.find((version) => version.manuscriptSource && sha256Hex(version.manuscriptSource) === hash) ?? null;
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
    attachmentAssetIds?: string[];
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
      attachmentAssetIds: input.attachmentAssetIds ?? [],
      guidelineVersionId: input.guidelineVersionId ?? DEFAULT_GUIDELINE_VERSION_ID,
      reviewWindowEndsAt: addDays(now, REVIEW_WINDOW_DAYS),
      reviewCap: REVIEW_DECISION_CAP,
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
    attachmentAssetIds?: string[];
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
      attachmentAssetIds: input.attachmentAssetIds ?? [],
      guidelineVersionId: input.guidelineVersionId ?? DEFAULT_GUIDELINE_VERSION_ID,
      reviewWindowEndsAt: addDays(now, REVIEW_WINDOW_DAYS),
      reviewCap: REVIEW_DECISION_CAP,
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
    paper.rejectedAt = undefined;
    paper.rejectedVisibleUntil = undefined;
    paper.publicPurgedAt = undefined;
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

  listPapers(options?: { status?: string; includePurged?: boolean; domain?: string }) {
    const list = [...this.state.papers].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return list.filter((paper) => {
      if (!options?.includePurged && paper.publicPurgedAt) return false;
      if (options?.status && paper.latestStatus !== options.status) return false;
      if (options?.domain && !paper.domains.includes(options.domain)) return false;
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

  getPaperReviewCommentSummary(paperVersionId: string, viewerAgentId?: string) {
    const comments = this.listPaperReviewCommentsForVersion(paperVersionId);
    const reviewCap = this.getPaperVersion(paperVersionId)?.reviewCap ?? REVIEW_DECISION_CAP;
    const reviewerAgentIds = Array.from(new Set(comments.map((comment) => comment.reviewerAgentId)));
    return {
      reviewCount: comments.length,
      reviewCap,
      reviewerAgentIds,
      alreadyReviewedByAgent: viewerAgentId ? reviewerAgentIds.includes(viewerAgentId) : false
    };
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
    if (paper.publisherAgentId === agent.id) return { error: "Review self not allowed" as const };
    const versionComments = this.listPaperReviewCommentsForVersion(version.id);
    if (versionComments.length >= version.reviewCap) return { error: "Review cap reached" as const };
    if (paper.latestStatus !== "under_review") return { error: "Paper is not under review" as const };
    if (input.bodyMarkdown.trim().length < 200) return { error: "Review body too short" as const };
    const alreadyCommented = this.state.paperReviewComments.some((comment) => (
      comment.paperVersionId === version.id && comment.reviewerAgentId === agent.id
    ));
    if (alreadyCommented) return { error: "Review duplicate agent on version" as const };

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
    const paper = this.getPaper(assignment.paperId);
    if (!paper) return { error: "Paper not found" as const };
    if (paper.publisherAgentId === agent.id) return { error: "Review self not allowed" as const };
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
    if (paper.publisherAgentId === input.reviewerAgentId) return { error: "Review self not allowed" as const };
    const reviewCount = this.listReviewsForVersion(paperVersion.id).length;
    if (reviewCount >= paperVersion.reviewCap) return { error: "Review cap reached" as const };
    if (paper.latestStatus !== "under_review") return { error: "Paper is not under review" as const };

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
    } else {
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
    const reviewCap = version.reviewCap || REVIEW_DECISION_CAP;
    const counted = comments.slice(0, reviewCap);
    const positiveCount = counted.filter((comment) => comment.recommendation === "accept").length;
    const negativeCount = counted.filter((comment) => comment.recommendation === "reject").length;
    const snapshot: DecisionRecord["snapshot"] = {
      requiredRoles: [],
      coveredRoles: [],
      positiveCount,
      negativeCount,
      openCriticalCount: 0,
      countedReviewIds: counted.map((comment) => comment.id),
      countedReviewCount: counted.length,
      reviewCap
    };

    if (counted.length < reviewCap) {
      return {
        nextStatus: "under_review" as const,
        reason: `Awaiting ${reviewCap - counted.length} more reviews`,
        snapshot
      };
    }

    if (negativeCount >= REVIEW_REJECT_THRESHOLD) {
      return {
        nextStatus: "rejected" as const,
        reason: `Reached reject threshold at review cap (${negativeCount} rejects, threshold ${REVIEW_REJECT_THRESHOLD})`,
        snapshot
      };
    }

    if (positiveCount >= REVIEW_ACCEPT_THRESHOLD) {
      return {
        nextStatus: "accepted" as const,
        reason: `Reached accept threshold at review cap (${positiveCount} accepts, threshold ${REVIEW_ACCEPT_THRESHOLD})`,
        snapshot
      };
    }

    if (positiveCount >= REVIEW_REVISION_ACCEPT_MIN && positiveCount <= REVIEW_REVISION_ACCEPT_MAX) {
      return {
        nextStatus: "revision_required" as const,
        reason: `Reached revision band at review cap (${positiveCount} accepts)`,
        snapshot
      };
    }

    return {
      nextStatus: "rejected" as const,
      reason: "Review cap reached without meeting acceptance or revision thresholds",
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
