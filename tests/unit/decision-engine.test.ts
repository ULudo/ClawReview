import { describe, expect, it } from "vitest";
import { evaluateDecision } from "../../src/lib/decision-engine/evaluate";
import type { PaperVersion, Review } from "../../src/lib/types";

function mkVersion(overrides: Partial<PaperVersion> = {}): PaperVersion {
  return {
    id: "pv_1",
    paperId: "paper_1",
    versionNumber: 1,
    title: "Test",
    abstract: "Abstract",
    domains: ["ai-ml"],
    keywords: ["test"],
    claimTypes: ["theory"],
    language: "en",
    references: [],
    contentSections: { problem_statement: "x" },
    guidelineVersionId: "guideline-base-v1",
    reviewWindowEndsAt: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
    createdByAgentId: "agent_pub",
    codeRequired: false,
    ...overrides
  };
}

function mkReview(id: string, role: Review["role"], recommendation: Review["recommendation"], domain: string): Review {
  return {
    id,
    paperId: "paper_1",
    paperVersionId: "pv_1",
    assignmentId: `asg_${id}`,
    reviewerAgentId: `agent_${id}`,
    reviewerOriginDomain: domain,
    role,
    guidelineVersionId: "guideline-base-v1",
    recommendation,
    scores: {},
    summary: "summary",
    strengths: [],
    weaknesses: [],
    questions: [],
    findings: [],
    skillManifestHash: "hash",
    createdAt: new Date().toISOString(),
    countedForDecision: false
  };
}

describe("evaluateDecision", () => {
  it("accepts with required role coverage and 4 counted positives (non-code)", () => {
    const version = mkVersion();
    const reviews: Review[] = [
      mkReview("1", "novelty", "accept", "a.example"),
      mkReview("2", "method", "weak_accept", "b.example"),
      mkReview("3", "evidence", "accept", "c.example"),
      mkReview("4", "literature", "accept", "d.example"),
      mkReview("5", "adversarial", "borderline", "e.example")
    ];
    const result = evaluateDecision({ version, reviews });
    expect(result.nextStatus).toBe("accepted");
  });

  it("rejects early after 3 counted negatives", () => {
    const version = mkVersion();
    const reviews: Review[] = [
      mkReview("1", "novelty", "reject", "a.example"),
      mkReview("2", "method", "weak_reject", "b.example"),
      mkReview("3", "evidence", "reject", "c.example")
    ];
    const result = evaluateDecision({ version, reviews });
    expect(result.nextStatus).toBe("rejected");
  });

  it("counts only one review per origin domain", () => {
    const version = mkVersion();
    const reviews: Review[] = [
      mkReview("1", "novelty", "accept", "dup.example"),
      mkReview("2", "method", "accept", "dup.example"),
      mkReview("3", "evidence", "accept", "c.example"),
      mkReview("4", "literature", "accept", "d.example"),
      mkReview("5", "adversarial", "accept", "e.example")
    ];
    const result = evaluateDecision({ version, reviews });
    expect(result.snapshot.countedReviewIds).toHaveLength(4);
    expect(result.nextStatus).toBe("accepted");
  });
});
