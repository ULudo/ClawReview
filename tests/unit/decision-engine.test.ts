import { describe, expect, it } from "vitest";
import { evaluateReviewCommentDecision } from "../../src/lib/decision-engine/evaluate";

function mkVote(id: string, recommendation: "accept" | "reject", voterKey: string) {
  return { id, recommendation, voterKey };
}

describe("evaluateReviewCommentDecision", () => {
  it("stays under_review with fewer than 4 counted reviews", () => {
    const result = evaluateReviewCommentDecision({
      reviewCap: 4,
      votes: [
        mkVote("1", "accept", "human:a"),
        mkVote("2", "accept", "human:b"),
        mkVote("3", "reject", "human:c")
      ]
    });
    expect(result.nextStatus).toBe("under_review");
  });

  it("marks revision_required at cap when rejects are >= 2", () => {
    const result = evaluateReviewCommentDecision({
      reviewCap: 4,
      votes: [
        mkVote("1", "reject", "human:1"),
        mkVote("2", "reject", "human:2"),
        mkVote("3", "accept", "human:3"),
        mkVote("4", "accept", "human:4")
      ]
    });
    expect(result.nextStatus).toBe("revision_required");
  });

  it("returns revision_required at cap for 0 or 1 accepts", () => {
    const result = evaluateReviewCommentDecision({
      reviewCap: 4,
      votes: [
        mkVote("1", "accept", "human:1"),
        mkVote("2", "reject", "human:2"),
        mkVote("3", "reject", "human:3"),
        mkVote("4", "reject", "human:4")
      ]
    });
    expect(result.nextStatus).toBe("revision_required");
  });

  it("accepts at cap for 3 accepts", () => {
    const result = evaluateReviewCommentDecision({
      reviewCap: 4,
      votes: [
        mkVote("1", "accept", "human:1"),
        mkVote("2", "accept", "human:2"),
        mkVote("3", "accept", "human:3"),
        mkVote("4", "reject", "human:4")
      ]
    });
    expect(result.nextStatus).toBe("accepted");
  });

  it("accepts at cap for 4 accepts", () => {
    const result = evaluateReviewCommentDecision({
      reviewCap: 4,
      votes: [
        mkVote("1", "accept", "human:1"),
        mkVote("2", "accept", "human:2"),
        mkVote("3", "accept", "human:3"),
        mkVote("4", "accept", "human:4")
      ]
    });
    expect(result.nextStatus).toBe("accepted");
  });

  it("counts only one vote per voter key", () => {
    const result = evaluateReviewCommentDecision({
      reviewCap: 4,
      votes: [
        mkVote("1", "accept", "human:1"),
        mkVote("2", "reject", "human:1"),
        mkVote("3", "accept", "human:2")
      ]
    });
    expect(result.snapshot.countedReviewIds).toEqual(["1", "3"]);
    expect(result.snapshot.countedReviewCount).toBe(2);
  });
});
