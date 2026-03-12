import { describe, expect, it } from "vitest";
import { evaluateReviewCommentDecision } from "../../src/lib/decision-engine/evaluate";

function mkVote(id: string, recommendation: "accept" | "reject", voterKey: string) {
  return { id, recommendation, voterKey };
}

describe("evaluateReviewCommentDecision", () => {
  it("stays under_review with fewer than 10 counted reviews", () => {
    const result = evaluateReviewCommentDecision({
      reviewCap: 10,
      votes: [
        mkVote("1", "accept", "human:a"),
        mkVote("2", "accept", "human:b"),
        mkVote("3", "reject", "human:c")
      ]
    });
    expect(result.nextStatus).toBe("under_review");
  });

  it("rejects at cap when rejects are >= 5", () => {
    const result = evaluateReviewCommentDecision({
      reviewCap: 10,
      votes: [
        mkVote("1", "reject", "human:1"),
        mkVote("2", "reject", "human:2"),
        mkVote("3", "reject", "human:3"),
        mkVote("4", "reject", "human:4"),
        mkVote("5", "reject", "human:5"),
        mkVote("6", "accept", "human:6"),
        mkVote("7", "accept", "human:7"),
        mkVote("8", "accept", "human:8"),
        mkVote("9", "accept", "human:9"),
        mkVote("10", "accept", "human:10")
      ]
    });
    expect(result.nextStatus).toBe("rejected");
  });

  it("returns revision_required at cap for 6..8 accepts", () => {
    const result = evaluateReviewCommentDecision({
      reviewCap: 10,
      votes: [
        mkVote("1", "accept", "human:1"),
        mkVote("2", "accept", "human:2"),
        mkVote("3", "accept", "human:3"),
        mkVote("4", "accept", "human:4"),
        mkVote("5", "accept", "human:5"),
        mkVote("6", "accept", "human:6"),
        mkVote("7", "accept", "human:7"),
        mkVote("8", "reject", "human:8"),
        mkVote("9", "reject", "human:9"),
        mkVote("10", "reject", "human:10")
      ]
    });
    expect(result.nextStatus).toBe("revision_required");
  });

  it("accepts at cap for 9 accepts", () => {
    const result = evaluateReviewCommentDecision({
      reviewCap: 10,
      votes: [
        mkVote("1", "accept", "human:1"),
        mkVote("2", "accept", "human:2"),
        mkVote("3", "accept", "human:3"),
        mkVote("4", "accept", "human:4"),
        mkVote("5", "accept", "human:5"),
        mkVote("6", "accept", "human:6"),
        mkVote("7", "accept", "human:7"),
        mkVote("8", "accept", "human:8"),
        mkVote("9", "accept", "human:9"),
        mkVote("10", "reject", "human:10")
      ]
    });
    expect(result.nextStatus).toBe("accepted");
  });

  it("uses reject precedence at 5 accepts and 5 rejects", () => {
    const result = evaluateReviewCommentDecision({
      reviewCap: 10,
      votes: [
        mkVote("1", "accept", "human:1"),
        mkVote("2", "accept", "human:2"),
        mkVote("3", "accept", "human:3"),
        mkVote("4", "accept", "human:4"),
        mkVote("5", "accept", "human:5"),
        mkVote("6", "reject", "human:6"),
        mkVote("7", "reject", "human:7"),
        mkVote("8", "reject", "human:8"),
        mkVote("9", "reject", "human:9"),
        mkVote("10", "reject", "human:10")
      ]
    });
    expect(result.nextStatus).toBe("rejected");
  });

  it("counts only one vote per voter key", () => {
    const result = evaluateReviewCommentDecision({
      reviewCap: 10,
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
