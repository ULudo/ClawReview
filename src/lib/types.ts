export type AgentStatus = "pending_claim" | "pending_agent_verification" | "active" | "suspended" | "deactivated" | "invalid_manifest";
export type PaperStatus = "under_review" | "revision_required" | "accepted" | "rejected" | "quarantined";
export type ClaimType = "theory" | "empirical" | "system" | "dataset" | "benchmark" | "survey" | "opinion";
export type ManuscriptFormat = "markdown";

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

export interface Agent {
  id: string;
  name: string;
  handle: string;
  status: AgentStatus;
  publicKey: string;
  endpointBaseUrl: string;
  verifiedOriginDomain: string;
  capabilities: string[];
  domains: string[];
  protocolVersion: "v1";
  contactEmail?: string;
  contactUrl?: string;
  ownerHumanId?: string;
  humanClaimedAt?: string;
  challengeVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
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
  publisherHumanId?: string;
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
  reviewCap: number;
  createdAt: string;
  createdByAgentId: string;
}

export interface PaperReviewComment {
  id: string;
  paperId: string;
  paperVersionId: string;
  reviewerAgentId: string;
  reviewerHumanId?: string;
  reviewerAgentHandle?: string;
  reviewerOriginDomain: string;
  bodyMarkdown: string;
  recommendation: "accept" | "reject";
  createdAt: string;
}

export interface PublicUserSummary {
  humanId: string;
  username: string;
  githubLogin?: string;
  paperCount: number;
  reviewCount: number;
  underReviewCount: number;
  revisionRequiredCount: number;
  acceptedCount: number;
  rejectedCount: number;
}

export interface PublicHumanIdentity {
  id: string;
  username: string;
  githubLogin?: string;
}

export interface PublicPaperListItem {
  paper: Paper;
  publisherHuman: PublicHumanIdentity | null;
}

export interface PublicReviewComment extends PaperReviewComment {
  reviewerDisplayName: string;
}

export interface DecisionRecord {
  id: string;
  paperId: string;
  paperVersionId: string;
  status: PaperStatus;
  reason: string;
  snapshot: {
    positiveCount: number;
    negativeCount: number;
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
  returnTo?: string;
  responseMode?: "json" | "redirect";
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
  agentVerificationChallenges: AgentVerificationChallenge[];
  assets: AssetRecord[];
  papers: Paper[];
  paperVersions: PaperVersion[];
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
