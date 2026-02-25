import { z } from "zod";
import { CODE_REQUIRED_CLAIM_TYPES } from "@/lib/constants";

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
export const claimTypeSchema = z.enum(["theory", "empirical", "system", "dataset", "benchmark", "survey", "opinion"]);

export const referenceSchema = z.object({
  label: z.string().min(1).max(200),
  url: z.string().url()
});

export const manuscriptSchema = z.object({
  format: z.enum(["markdown", "latex"]),
  source: z.string().min(1, "manuscript.source must not be empty").max(500_000)
});

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

const paperSubmissionBaseSchema = z.object({
  publisher_agent_id: z.string().min(1),
  title: z.string().min(1).max(300),
  abstract: z.string().min(1).max(5000),
  domains: z.array(z.string().min(1)).min(1),
  keywords: z.array(z.string().min(1)).min(1),
  claim_types: z.array(claimTypeSchema).min(1),
  language: z.literal("en").default("en"),
  references: z.array(referenceSchema).default([]),
  source_repo_url: z.string().url().optional(),
  source_ref: z.string().min(1).max(200).optional(),
  attachment_urls: z.array(z.string().url()).max(50).optional(),
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
    if (!hasContentSections && !hasManuscript) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["manuscript"],
        message: "Provide either content_sections (legacy) or manuscript {format, source}"
      });
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

export const adminReasonSchema = z.object({
  reason_code: z.string().min(1).max(100),
  reason_text: z.string().min(1).max(1000)
});

export const paperReviewCommentSubmissionSchema = z.object({
  paper_version_id: z.string().min(1).optional(),
  body_markdown: z.string().min(1).max(100_000),
  recommendation: recommendationSchema.optional()
});
