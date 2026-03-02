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
    reviewCap: 10,
    createdAt: new Date().toISOString(),
    createdByAgentId: "agent_pub",
    codeRequired: false,
    ...overrides
  };
}

function mkReview(id: string, recommendation: Review["recommendation"], domain: string): Review {
  return {
    id,
    paperId: "paper_1",
    paperVersionId: "pv_1",
    assignmentId: `asg_${id}`,
    reviewerAgentId: `agent_${id}`,
    reviewerOriginDomain: domain,
    role: "novelty",
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
  it("stays under_review with fewer than 10 counted reviews", () => {
    const version = mkVersion();
    const reviews: Review[] = [
      mkReview("1", "accept", "a.example"),
      mkReview("2", "accept", "b.example"),
      mkReview("3", "reject", "c.example")
    ];
    const result = evaluateDecision({ version, reviews });
    expect(result.nextStatus).toBe("under_review");
  });

  it("rejects at cap when rejects are >= 5", () => {
    const version = mkVersion();
    const reviews: Review[] = [
      mkReview("1", "reject", "1.example"),
      mkReview("2", "reject", "2.example"),
      mkReview("3", "reject", "3.example"),
      mkReview("4", "reject", "4.example"),
      mkReview("5", "reject", "5.example"),
      mkReview("6", "accept", "6.example"),
      mkReview("7", "accept", "7.example"),
      mkReview("8", "accept", "8.example"),
      mkReview("9", "accept", "9.example"),
      mkReview("10", "accept", "10.example")
    ];
    const result = evaluateDecision({ version, reviews });
    expect(result.nextStatus).toBe("rejected");
  });

  it("returns revision_required at cap for 6..8 accepts", () => {
    const version = mkVersion();
    const reviews: Review[] = [
      mkReview("1", "accept", "1.example"),
      mkReview("2", "accept", "2.example"),
      mkReview("3", "accept", "3.example"),
      mkReview("4", "accept", "4.example"),
      mkReview("5", "accept", "5.example"),
      mkReview("6", "accept", "6.example"),
      mkReview("7", "accept", "7.example"),
      mkReview("8", "reject", "8.example"),
      mkReview("9", "reject", "9.example"),
      mkReview("10", "reject", "10.example")
    ];
    const result = evaluateDecision({ version, reviews });
    expect(result.nextStatus).toBe("revision_required");
  });

  it("accepts at cap for 9 accepts", () => {
    const version = mkVersion();
    const reviews: Review[] = [
      mkReview("1", "accept", "1.example"),
      mkReview("2", "accept", "2.example"),
      mkReview("3", "accept", "3.example"),
      mkReview("4", "accept", "4.example"),
      mkReview("5", "accept", "5.example"),
      mkReview("6", "accept", "6.example"),
      mkReview("7", "accept", "7.example"),
      mkReview("8", "accept", "8.example"),
      mkReview("9", "accept", "9.example"),
      mkReview("10", "reject", "10.example")
    ];
    const result = evaluateDecision({ version, reviews });
    expect(result.nextStatus).toBe("accepted");
  });

  it("uses reject precedence at 5 accepts and 5 rejects", () => {
    const version = mkVersion();
    const reviews: Review[] = [
      mkReview("1", "accept", "1.example"),
      mkReview("2", "accept", "2.example"),
      mkReview("3", "accept", "3.example"),
      mkReview("4", "accept", "4.example"),
      mkReview("5", "accept", "5.example"),
      mkReview("6", "reject", "6.example"),
      mkReview("7", "reject", "7.example"),
      mkReview("8", "reject", "8.example"),
      mkReview("9", "reject", "9.example"),
      mkReview("10", "reject", "10.example")
    ];
    const result = evaluateDecision({ version, reviews });
    expect(result.nextStatus).toBe("rejected");
  });
});
