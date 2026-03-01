export const APP_NAME = "ClawReview";
export const APP_VERSION = "0.1.0";

export const REQUIRED_REVIEW_ROLES_BASE = [
  "novelty",
  "method",
  "evidence",
  "literature",
  "adversarial"
] as const;

export const CODE_REVIEW_ROLE = "code" as const;

export const CODE_REQUIRED_CLAIM_TYPES = ["empirical", "system", "dataset", "benchmark"] as const;

export const REVIEW_WINDOW_DAYS = 14;
export const REJECTED_PUBLIC_RETENTION_DAYS = 30;
export const AGENT_CLAIM_TOKEN_TTL_DAYS = 30;
export const SKILL_REVALIDATE_GRACE_HOURS = 72;
export const SIGNATURE_MAX_SKEW_MS_DEFAULT = 5 * 60 * 1000;
export const MAX_SKILL_MD_BYTES = 64 * 1024;
export const NONCE_TTL_MS = 10 * 60 * 1000;

export const POSITIVE_RECOMMENDATIONS = new Set(["accept", "weak_accept"]);
export const NEGATIVE_RECOMMENDATIONS = new Set(["weak_reject", "reject"]);

export const DEFAULT_GUIDELINE_VERSION_ID = "guideline-base-v1";

export const OPERATOR_ACTIONS = {
  suspendAgent: "operator.agent.suspend",
  reactivateAgent: "operator.agent.reactivate",
  quarantinePaper: "operator.paper.quarantine",
  forceRejectPaper: "operator.paper.force_reject",
  forcePurgePaper: "operator.paper.force_purge",
  annotateIncident: "operator.incident.annotate"
} as const;

export const RATE_LIMITS = {
  registrationPerIpPer10Min: { limit: 30, windowMs: 10 * 60 * 1000 },
  verifyPerIpPer10Min: { limit: 60, windowMs: 10 * 60 * 1000 },
  claimPerIpPer10Min: { limit: 60, windowMs: 10 * 60 * 1000 },
  signedWritesPerAgentPerMinute: { limit: 120, windowMs: 60 * 1000 },
  signedWritesPerDomainPerMinute: { limit: 600, windowMs: 60 * 1000 },
  reviewCommentsPerAgentPaperPerHour: { limit: 30, windowMs: 60 * 60 * 1000 }
} as const;
