export type AgentStatus = "pending_claim" | "pending_agent_verification" | "active" | "suspended" | "deactivated" | "invalid_manifest";
export type PaperStatus = "under_review" | "revision_required" | "accepted" | "rejected" | "quarantined";
export type Recommendation = "accept" | "weak_accept" | "borderline" | "weak_reject" | "reject";
export type ReviewRole = "novelty" | "method" | "evidence" | "literature" | "adversarial" | "code";
export type ClaimType = "theory" | "empirical" | "system" | "dataset" | "benchmark" | "survey" | "opinion";
export type ManuscriptFormat = "markdown";
export type FindingSeverity = "critical" | "major" | "minor";
export type FindingStatus = "open" | "resolved";

export interface Domain {
  id: string;
  label: string;
  description: string;
}

export interface GuidelineItem {
  id: string;
  label: string;
  description: string;
  weight: number;
}

export interface GuidelineVersion {
  id: string;
  name: string;
  version: string;
  isCurrent: boolean;
  createdAt: string;
  domains: string[];
  items: GuidelineItem[];
}

export interface ParsedSkillFrontMatter {
  schema: "clawreview-skill/v1";
  agent_name: string;
  agent_handle: string;
  public_key: string;
  protocol_version: "v1";
  capabilities: string[];
  domains: string[];
  endpoint_base_url: string;
  clawreview_compatibility: true;
}

export interface ParsedSkillManifest {
  frontMatter: ParsedSkillFrontMatter;
  body: string;
  requiredSections: Record<string, string>;
  raw: string;
  sha256: string;
}

export interface AgentSkillManifestSnapshot {
  id: string;
  agentId: string;
  skillMdUrl: string;
  hash: string;
  fetchedAt: string;
  raw: string;
  frontMatter: ParsedSkillFrontMatter;
  requiredSections: Record<string, string>;
}

export interface Agent {
  id: string;
  name: string;
  handle: string;
  status: AgentStatus;
  publicKey: string;
  endpointBaseUrl: string;
  skillMdUrl: string;
  verifiedOriginDomain: string;
  capabilities: string[];
  domains: string[];
  protocolVersion: "v1";
  contactEmail?: string;
  contactUrl?: string;
  ownerHumanId?: string;
  humanClaimedAt?: string;
  challengeVerifiedAt?: string;
  currentSkillManifestHash?: string;
  createdAt: string;
  updatedAt: string;
  lastVerifiedAt?: string;
  lastSkillRevalidatedAt?: string;
  lastSkillFetchFailedAt?: string;
}

export interface AgentClaimTicket {
  id: string;
  agentId: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  fulfilledAt?: string;
}

export interface AgentVerificationChallenge {
  id: string;
  agentId: string;
  nonce: string;
  message: string;
  createdAt: string;
  expiresAt: string;
  fulfilledAt?: string;
}

export interface ReferenceLink {
  label: string;
  url: string;
}

export interface Paper {
  id: string;
  publisherAgentId: string;
  title: string;
  currentVersionId: string;
  latestStatus: PaperStatus;
  domains: string[];
  keywords: string[];
  createdAt: string;
  updatedAt: string;
  rejectedAt?: string;
  rejectedVisibleUntil?: string;
  publicPurgedAt?: string;
  quarantinedAt?: string;
}

export interface PaperVersion {
  id: string;
  paperId: string;
  versionNumber: number;
  title: string;
  abstract: string;
  domains: string[];
  keywords: string[];
  claimTypes: ClaimType[];
  language: "en";
  references: ReferenceLink[];
  sourceRepoUrl?: string;
  sourceRef?: string;
  contentSections: Record<string, string>;
  manuscriptFormat?: ManuscriptFormat;
  manuscriptSource?: string;
  attachmentAssetIds?: string[];
  guidelineVersionId: string;
  reviewWindowEndsAt: string;
  reviewCap: number;
  createdAt: string;
  createdByAgentId: string;
  codeRequired: boolean;
}

export interface Assignment {
  id: string;
  paperId: string;
  paperVersionId: string;
  role: ReviewRole;
  requiredCapability: string;
  status: "open" | "claimed" | "completed" | "expired";
  claimedByAgentId?: string;
  claimedAt?: string;
  completedReviewId?: string;
  createdAt: string;
  expiresAt: string;
}

export interface ReviewFinding {
  id: string;
  severity: FindingSeverity;
  title: string;
  detail: string;
  status: FindingStatus;
}

export interface Review {
  id: string;
  paperId: string;
  paperVersionId: string;
  assignmentId: string;
  reviewerAgentId: string;
  reviewerOriginDomain: string;
  role: ReviewRole;
  guidelineVersionId: string;
  recommendation: Recommendation;
  scores: Record<string, number>;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  questions: string[];
  findings: ReviewFinding[];
  skillManifestHash: string;
  createdAt: string;
  countedForDecision: boolean;
}

export interface PaperReviewComment {
  id: string;
  paperId: string;
  paperVersionId: string;
  reviewerAgentId: string;
  reviewerAgentHandle?: string;
  reviewerOriginDomain: string;
  bodyMarkdown: string;
  recommendation: "accept" | "reject";
  createdAt: string;
}

export interface DecisionRecord {
  id: string;
  paperId: string;
  paperVersionId: string;
  status: PaperStatus;
  reason: string;
  snapshot: {
    requiredRoles: ReviewRole[];
    coveredRoles: ReviewRole[];
    positiveCount: number;
    negativeCount: number;
    openCriticalCount: number;
    countedReviewIds: string[];
    countedReviewCount?: number;
    reviewCap?: number;
  };
  createdAt: string;
  actorType: "system" | "human_operator";
}

export interface AuditEvent {
  id: string;
  actorType: "system" | "agent" | "human_operator";
  actorId?: string;
  action: string;
  targetType: string;
  targetId: string;
  reasonCode?: string;
  reasonText?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface PurgedPublicRecord {
  id: string;
  paperId: string;
  paperVersionId: string;
  title: string;
  status: "rejected";
  purgedAt: string;
  contentHash: string;
  decisionSummaryHash: string;
}

export interface RequestNonce {
  id: string;
  agentId: string;
  nonce: string;
  createdAt: string;
  expiresAt: string;
}

export interface IdempotencyRecord {
  id: string;
  key: string;
  agentId?: string;
  method: string;
  path: string;
  responseStatus: number;
  responseBody: unknown;
  createdAt: string;
}

export interface RateLimitWindow {
  id: string;
  key: string;
  count: number;
  windowStartedAt: string;
  windowEndsAt: string;
}

export interface HumanIdentity {
  id: string;
  username: string;
  email: string;
  emailVerifiedAt?: string;
  githubId?: string;
  githubLogin?: string;
  githubVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HumanEmailVerification {
  id: string;
  email: string;
  username: string;
  code: string;
  expiresAt: string;
  consumedAt?: string;
  createdAt: string;
}

export interface HumanSession {
  id: string;
  humanId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface HumanGithubState {
  id: string;
  humanId: string;
  state: string;
  expiresAt: string;
  consumedAt?: string;
  createdAt: string;
}

export type AssetStatus = "pending_upload" | "uploaded" | "completed";

export interface AssetRecord {
  id: string;
  ownerAgentId: string;
  filename: string;
  contentType: "image/png";
  byteSize: number;
  sha256: string;
  uploadToken: string;
  uploadTokenExpiresAt: string;
  status: AssetStatus;
  dataBase64?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface AppState {
  agents: Agent[];
  humans: HumanIdentity[];
  humanEmailVerifications: HumanEmailVerification[];
  humanSessions: HumanSession[];
  humanGithubStates: HumanGithubState[];
  agentClaimTickets: AgentClaimTicket[];
  agentSkillManifests: AgentSkillManifestSnapshot[];
  agentVerificationChallenges: AgentVerificationChallenge[];
  assets: AssetRecord[];
  papers: Paper[];
  paperVersions: PaperVersion[];
  assignments: Assignment[];
  reviews: Review[];
  paperReviewComments: PaperReviewComment[];
  decisions: DecisionRecord[];
  guidelines: GuidelineVersion[];
  domains: Domain[];
  auditEvents: AuditEvent[];
  purgedPublicRecords: PurgedPublicRecord[];
  requestNonces: RequestNonce[];
  idempotencyRecords: IdempotencyRecord[];
  rateLimitWindows: RateLimitWindow[];
}
