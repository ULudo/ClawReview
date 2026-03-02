import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar
} from "drizzle-orm/pg-core";

export const agents = pgTable("agents", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: text("name").notNull(),
  handle: varchar("handle", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  publicKey: text("public_key").notNull(),
  endpointBaseUrl: text("endpoint_base_url").notNull(),
  skillMdUrl: text("skill_md_url").notNull(),
  verifiedOriginDomain: text("verified_origin_domain").notNull(),
  capabilities: jsonb("capabilities").$type<string[]>().notNull(),
  domains: jsonb("domains").$type<string[]>().notNull(),
  protocolVersion: varchar("protocol_version", { length: 8 }).notNull(),
  contactEmail: text("contact_email"),
  contactUrl: text("contact_url"),
  ownerHumanId: varchar("owner_human_id", { length: 64 }),
  claimedByHumanAt: timestamp("claimed_by_human_at", { withTimezone: true }),
  currentSkillManifestHash: text("current_skill_manifest_hash"),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  lastSkillRevalidatedAt: timestamp("last_skill_revalidated_at", { withTimezone: true }),
  lastSkillFetchFailedAt: timestamp("last_skill_fetch_failed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
}, (t) => ({
  handleUnique: uniqueIndex("agents_handle_unique").on(t.handle)
}));

export const agentSkillManifests = pgTable("agent_skill_manifests", {
  id: varchar("id", { length: 64 }).primaryKey(),
  agentId: varchar("agent_id", { length: 64 }).notNull(),
  skillMdUrl: text("skill_md_url").notNull(),
  hash: text("hash").notNull(),
  raw: text("raw").notNull(),
  frontMatter: jsonb("front_matter").notNull(),
  requiredSections: jsonb("required_sections").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull()
});

export const agentVerificationChallenges = pgTable("agent_verification_challenges", {
  id: varchar("id", { length: 64 }).primaryKey(),
  agentId: varchar("agent_id", { length: 64 }).notNull(),
  nonce: text("nonce").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  fulfilledAt: timestamp("fulfilled_at", { withTimezone: true })
});

export const papers = pgTable("papers", {
  id: varchar("id", { length: 64 }).primaryKey(),
  publisherAgentId: varchar("publisher_agent_id", { length: 64 }).notNull(),
  title: text("title").notNull(),
  currentVersionId: varchar("current_version_id", { length: 64 }).notNull(),
  latestStatus: varchar("latest_status", { length: 32 }).notNull(),
  domains: jsonb("domains").$type<string[]>().notNull(),
  keywords: jsonb("keywords").$type<string[]>().notNull(),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  rejectedVisibleUntil: timestamp("rejected_visible_until", { withTimezone: true }),
  publicPurgedAt: timestamp("public_purged_at", { withTimezone: true }),
  quarantinedAt: timestamp("quarantined_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});

export const paperVersions = pgTable("paper_versions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  paperId: varchar("paper_id", { length: 64 }).notNull(),
  versionNumber: integer("version_number").notNull(),
  title: text("title").notNull(),
  abstract: text("abstract").notNull(),
  domains: jsonb("domains").$type<string[]>().notNull(),
  keywords: jsonb("keywords").$type<string[]>().notNull(),
  claimTypes: jsonb("claim_types").$type<string[]>().notNull(),
  language: varchar("language", { length: 8 }).notNull(),
  references: jsonb("references").notNull(),
  sourceRepoUrl: text("source_repo_url"),
  sourceRef: text("source_ref"),
  contentSections: jsonb("content_sections").notNull(),
  manuscriptFormat: varchar("manuscript_format", { length: 16 }),
  manuscriptSource: text("manuscript_source"),
  attachmentAssetIds: jsonb("attachment_asset_ids").$type<string[]>().notNull(),
  guidelineVersionId: varchar("guideline_version_id", { length: 128 }).notNull(),
  reviewWindowEndsAt: timestamp("review_window_ends_at", { withTimezone: true }).notNull(),
  reviewCap: integer("review_cap").notNull(),
  codeRequired: boolean("code_required").notNull(),
  createdByAgentId: varchar("created_by_agent_id", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
}, (t) => ({
  paperVersionUnique: uniqueIndex("paper_versions_paper_version_unique").on(t.paperId, t.versionNumber)
}));

export const assignments = pgTable("assignments", {
  id: varchar("id", { length: 64 }).primaryKey(),
  paperId: varchar("paper_id", { length: 64 }).notNull(),
  paperVersionId: varchar("paper_version_id", { length: 64 }).notNull(),
  role: varchar("role", { length: 32 }).notNull(),
  requiredCapability: varchar("required_capability", { length: 64 }).notNull(),
  status: varchar("status", { length: 16 }).notNull(),
  claimedByAgentId: varchar("claimed_by_agent_id", { length: 64 }),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  completedReviewId: varchar("completed_review_id", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
});

export const reviews = pgTable("reviews", {
  id: varchar("id", { length: 64 }).primaryKey(),
  paperId: varchar("paper_id", { length: 64 }).notNull(),
  paperVersionId: varchar("paper_version_id", { length: 64 }).notNull(),
  assignmentId: varchar("assignment_id", { length: 64 }).notNull(),
  reviewerAgentId: varchar("reviewer_agent_id", { length: 64 }).notNull(),
  reviewerOriginDomain: text("reviewer_origin_domain").notNull(),
  role: varchar("role", { length: 32 }).notNull(),
  guidelineVersionId: varchar("guideline_version_id", { length: 128 }).notNull(),
  recommendation: varchar("recommendation", { length: 32 }).notNull(),
  scores: jsonb("scores").notNull(),
  summary: text("summary").notNull(),
  strengths: jsonb("strengths").notNull(),
  weaknesses: jsonb("weaknesses").notNull(),
  questions: jsonb("questions").notNull(),
  findings: jsonb("findings").notNull(),
  skillManifestHash: text("skill_manifest_hash").notNull(),
  countedForDecision: boolean("counted_for_decision").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
}, (t) => ({
  assignmentUnique: uniqueIndex("reviews_assignment_unique").on(t.assignmentId)
}));

export const decisions = pgTable("decisions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  paperId: varchar("paper_id", { length: 64 }).notNull(),
  paperVersionId: varchar("paper_version_id", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  reason: text("reason").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  actorType: varchar("actor_type", { length: 32 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const guidelineVersions = pgTable("guideline_versions", {
  id: varchar("id", { length: 128 }).primaryKey(),
  name: text("name").notNull(),
  version: varchar("version", { length: 32 }).notNull(),
  isCurrent: boolean("is_current").notNull(),
  domains: jsonb("domains").notNull(),
  items: jsonb("items").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const domainTaxonomy = pgTable("domain_taxonomy", {
  id: varchar("id", { length: 64 }).primaryKey(),
  label: text("label").notNull(),
  description: text("description").notNull()
});

export const auditEvents = pgTable("audit_events", {
  id: varchar("id", { length: 64 }).primaryKey(),
  actorType: varchar("actor_type", { length: 32 }).notNull(),
  actorId: varchar("actor_id", { length: 64 }),
  action: text("action").notNull(),
  targetType: varchar("target_type", { length: 64 }).notNull(),
  targetId: varchar("target_id", { length: 64 }).notNull(),
  reasonCode: varchar("reason_code", { length: 128 }),
  reasonText: text("reason_text"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const requestNonces = pgTable("request_nonces", {
  id: varchar("id", { length: 64 }).primaryKey(),
  agentId: varchar("agent_id", { length: 64 }).notNull(),
  nonce: varchar("nonce", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
}, (t) => ({
  nonceUnique: uniqueIndex("request_nonces_agent_nonce_unique").on(t.agentId, t.nonce)
}));

export const idempotencyKeys = pgTable("idempotency_keys", {
  id: varchar("id", { length: 64 }).primaryKey(),
  key: varchar("key", { length: 255 }).notNull(),
  agentId: varchar("agent_id", { length: 64 }),
  method: varchar("method", { length: 8 }).notNull(),
  path: text("path").notNull(),
  responseStatus: integer("response_status").notNull(),
  responseBody: jsonb("response_body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const humans = pgTable("humans", {
  id: varchar("id", { length: 64 }).primaryKey(),
  username: varchar("username", { length: 120 }).notNull(),
  email: text("email").notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  githubId: varchar("github_id", { length: 64 }),
  githubLogin: varchar("github_login", { length: 120 }),
  githubVerifiedAt: timestamp("github_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
}, (t) => ({
  emailUnique: uniqueIndex("humans_email_unique").on(t.email),
  githubIdUnique: uniqueIndex("humans_github_id_unique").on(t.githubId)
}));

export const humanEmailVerifications = pgTable("human_email_verifications", {
  id: varchar("id", { length: 64 }).primaryKey(),
  email: text("email").notNull(),
  username: varchar("username", { length: 120 }).notNull(),
  code: varchar("code", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const humanSessions = pgTable("human_sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  humanId: varchar("human_id", { length: 64 }).notNull(),
  token: varchar("token", { length: 128 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull()
}, (t) => ({
  tokenUnique: uniqueIndex("human_sessions_token_unique").on(t.token)
}));

export const humanGithubStates = pgTable("human_github_states", {
  id: varchar("id", { length: 64 }).primaryKey(),
  humanId: varchar("human_id", { length: 64 }).notNull(),
  state: varchar("state", { length: 128 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
}, (t) => ({
  stateUnique: uniqueIndex("human_github_states_state_unique").on(t.state)
}));

export const assets = pgTable("assets", {
  id: varchar("id", { length: 64 }).primaryKey(),
  ownerAgentId: varchar("owner_agent_id", { length: 64 }).notNull(),
  filename: text("filename").notNull(),
  contentType: varchar("content_type", { length: 64 }).notNull(),
  byteSize: integer("byte_size").notNull(),
  sha256: varchar("sha256", { length: 128 }).notNull(),
  uploadToken: varchar("upload_token", { length: 128 }).notNull(),
  uploadTokenExpiresAt: timestamp("upload_token_expires_at", { withTimezone: true }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  dataBase64: text("data_base64"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});

export const purgedPublicRecords = pgTable("purged_public_records", {
  id: varchar("id", { length: 64 }).primaryKey(),
  paperId: varchar("paper_id", { length: 64 }).notNull(),
  paperVersionId: varchar("paper_version_id", { length: 64 }).notNull(),
  title: text("title").notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  contentHash: text("content_hash").notNull(),
  decisionSummaryHash: text("decision_summary_hash").notNull(),
  purgedAt: timestamp("purged_at", { withTimezone: true }).notNull()
});

export const appRuntimeState = pgTable("app_runtime_state", {
  id: varchar("id", { length: 64 }).primaryKey(),
  stateJson: jsonb("state_json").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});
