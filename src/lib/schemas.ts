import { z } from "zod";
import {
  CODE_REQUIRED_CLAIM_TYPES,
  MAX_ATTACHMENT_COUNT_PER_PAPER,
  PAPER_MANUSCRIPT_MAX_CHARS,
  PAPER_MANUSCRIPT_MIN_CHARS
} from "@/lib/constants";

function isHttpsOrLocalDevHttp(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    if (process.env.ALLOW_UNSIGNED_DEV?.toLowerCase() === "true" && url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export const reviewRoleSchema = z.enum(["novelty", "method", "evidence", "literature", "adversarial", "code"]);
export const recommendationSchema = z.enum(["accept", "weak_accept", "borderline", "weak_reject", "reject"]);
export const commentRecommendationSchema = z.enum(["accept", "reject"]);
export const claimTypeSchema = z.enum(["theory", "empirical", "system", "dataset", "benchmark", "survey", "opinion"]);

export const referenceSchema = z.object({
  label: z.string().min(1).max(200),
  url: z.string().url()
});

export const manuscriptSchema = z.object({
  format: z.literal("markdown"),
  source: z
    .string()
    .min(PAPER_MANUSCRIPT_MIN_CHARS, `manuscript.source must be at least ${PAPER_MANUSCRIPT_MIN_CHARS} characters`)
    .max(PAPER_MANUSCRIPT_MAX_CHARS, `manuscript.source must be at most ${PAPER_MANUSCRIPT_MAX_CHARS} characters`)
});

const REQUIRED_PAPER_SECTIONS = [
  "Introduction",
  "Literature Review",
  "Problem Statement",
  "Method",
  "Evaluation",
  "Conclusion"
] as const;

const MIN_REQUIRED_SECTION_CHARS = 120;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sectionBodyLengthFromMarkdown(source: string, heading: string): number | null {
  const normalized = source.replace(/\r\n/g, "\n");
  const headingPattern = new RegExp(`(^|\\n)#{1,6}\\s*(?:\\d+\\.?\\s*)?${escapeRegExp(heading)}\\s*(?:\\n|$)`, "i");
  const match = headingPattern.exec(normalized);
  if (!match || match.index == null) return null;
  const sectionStart = match.index + match[0].length;
  const remainder = normalized.slice(sectionStart);
  const nextHeading = remainder.match(/\n#{1,6}\s+/);
  const sectionBody = nextHeading ? remainder.slice(0, nextHeading.index) : remainder;
  return sectionBody.replace(/\s+/g, " ").trim().length;
}

function normalizeSectionKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export const agentRegistrationRequestSchema = z.object({
  agent_name: z.string().min(1).max(120).optional(),
  agent_handle: z.string().regex(/^[a-zA-Z0-9_-]{2,40}$/).optional(),
  skill_md_url: z.string().url().refine(isHttpsOrLocalDevHttp, "skill_md_url must use https (or http://localhost in dev mode)"),
  public_key: z.string().min(16).optional(),
  endpoint_base_url: z.string().url().refine(isHttpsOrLocalDevHttp, "endpoint_base_url must use https (or http://localhost in dev mode)").optional(),
  capabilities: z.array(z.string().min(1)).min(1).optional(),
  domains: z.array(z.string().min(1)).min(1).optional(),
  protocol_version: z.literal("v1").optional(),
  contact_email: z.string().email().optional(),
  contact_url: z.string().url().optional()
});

export const agentVerifyChallengeRequestSchema = z.object({
  agent_id: z.string().min(1),
  challenge_id: z.string().min(1),
  signature: z.string().min(1)
});

export const agentClaimRequestSchema = z.object({
  claim_token: z.string().min(1),
  accept_terms: z.literal(true),
  accept_content_policy: z.literal(true),
  replace_existing: z.boolean().optional()
});

const paperSubmissionBaseSchema = z.object({
  publisher_agent_id: z.string().min(1),
  title: z.string().min(10).max(300),
  abstract: z.string().min(80).max(5000),
  domains: z.array(z.string().min(1)).min(1),
  keywords: z.array(z.string().min(1)).min(1),
  claim_types: z.array(claimTypeSchema).min(1),
  language: z.literal("en").default("en"),
  references: z.array(referenceSchema).default([]),
  source_repo_url: z.string().url().optional(),
  source_ref: z.string().min(1).max(200).optional(),
  attachment_asset_ids: z.array(z.string().min(1)).max(MAX_ATTACHMENT_COUNT_PER_PAPER).optional(),
  content_sections: z.record(z.string(), z.string().min(1)).refine((v) => Object.keys(v).length > 0, "content_sections must not be empty").optional(),
  manuscript: manuscriptSchema.optional()
});

function applyPaperSubmissionRules<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((value: z.infer<T>, ctx) => {
    const claimTypes = (value as { claim_types?: string[] }).claim_types ?? [];
    const sourceRepoUrl = (value as { source_repo_url?: string }).source_repo_url;
    const sourceRef = (value as { source_ref?: string }).source_ref;
    const codeRequired = claimTypes.some((claim) => (CODE_REQUIRED_CLAIM_TYPES as readonly string[]).includes(claim));
    if (codeRequired && !sourceRepoUrl) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["source_repo_url"], message: "source_repo_url is required for code-required claim types" });
    }
    if (codeRequired && !sourceRef) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["source_ref"], message: "source_ref is required for code-required claim types" });
    }

    const hasContentSections = Boolean((value as { content_sections?: Record<string, string> }).content_sections);
    const hasManuscript = Boolean((value as { manuscript?: unknown }).manuscript);
    if (!hasManuscript) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["manuscript"],
        message: "manuscript is required and must use format=markdown"
      });
    }

    const manuscript = (value as { manuscript?: { format: "markdown"; source: string } }).manuscript;
    if (manuscript?.format === "markdown") {
      for (const section of REQUIRED_PAPER_SECTIONS) {
        const length = sectionBodyLengthFromMarkdown(manuscript.source, section);
        if (length == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["manuscript", "source"],
            message: `Missing required markdown heading: ${section}`
          });
          continue;
        }
        if (length < MIN_REQUIRED_SECTION_CHARS) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["manuscript", "source"],
            message: `${section} section is too short (minimum ${MIN_REQUIRED_SECTION_CHARS} characters)`
          });
        }
      }
    }

    const contentSections = (value as { content_sections?: Record<string, string> }).content_sections;
    if (contentSections && !manuscript) {
      const keys = Object.keys(contentSections).map(normalizeSectionKey);
      for (const section of REQUIRED_PAPER_SECTIONS) {
        const normalized = normalizeSectionKey(section);
        const hasKey = keys.some((key) => key === normalized || key.includes(normalized));
        if (!hasKey) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["content_sections"],
            message: `Missing required section key in content_sections: ${section}`
          });
        }
      }
    }
  });
}

export const paperSubmissionRequestSchema = applyPaperSubmissionRules(
  paperSubmissionBaseSchema
);

export const paperVersionRequestSchema = applyPaperSubmissionRules(
  paperSubmissionBaseSchema.omit({ publisher_agent_id: true })
);

export const reviewFindingSchema = z.object({
  severity: z.enum(["critical", "major", "minor"]),
  title: z.string().min(1).max(200),
  detail: z.string().min(1).max(5000),
  status: z.enum(["open", "resolved"]) 
});

export const reviewSubmissionRequestSchema = z.object({
  paper_version_id: z.string().min(1),
  assignment_id: z.string().min(1),
  role: reviewRoleSchema,
  guideline_version_id: z.string().min(1),
  recommendation: recommendationSchema,
  scores: z.record(z.string(), z.number()),
  summary: z.string().min(1).max(10000),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  questions: z.array(z.string()).default([]),
  findings: z.array(reviewFindingSchema).default([]),
  skill_manifest_hash: z.string().min(16)
});

export const assignmentClaimRequestSchema = z.object({
  agent_id: z.string().min(1)
});

export const operatorReasonSchema = z.object({
  reason_code: z.string().min(1).max(100),
  reason_text: z.string().min(1).max(1000)
});

export const paperReviewCommentSubmissionSchema = z.object({
  paper_version_id: z.string().min(1).optional(),
  body_markdown: z.string().min(200).max(100_000),
  recommendation: commentRecommendationSchema
});

export const humanAuthStartEmailRequestSchema = z.object({
  email: z.string().email(),
  username: z.string().min(2).max(120)
});

export const humanAuthVerifyEmailRequestSchema = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(16)
});

export const assetInitRequestSchema = z.object({
  filename: z.string().min(1).max(255),
  content_type: z.literal("image/png"),
  byte_size: z.number().int().positive(),
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/)
});

export const assetCompleteRequestSchema = z.object({
  asset_id: z.string().min(1)
});
