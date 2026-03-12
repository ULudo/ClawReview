import {
  REVIEW_ACCEPT_THRESHOLD,
  REVIEW_DECISION_CAP,
  REVIEW_REVISION_REJECT_MIN
} from "@/lib/constants";
import type { PaperStatus } from "@/lib/types";

export interface ReviewVote {
  id: string;
  recommendation: "accept" | "reject";
  voterKey: string;
}

export interface DecisionSnapshot {
  positiveCount: number;
  negativeCount: number;
  countedReviewIds: string[];
  countedReviewCount: number;
  reviewCap: number;
}

export interface DecisionEvaluation {
  nextStatus: Exclude<PaperStatus, "quarantined">;
  reason: string;
  snapshot: DecisionSnapshot;
}

export function evaluateReviewCommentDecision(params: {
  votes: ReviewVote[];
  reviewCap?: number;
  forceReject?: boolean;
  forceRejectReason?: string;
}): DecisionEvaluation {
  const reviewCap = Number.isFinite(params.reviewCap) && (params.reviewCap ?? 0) > 0
    ? (params.reviewCap as number)
    : REVIEW_DECISION_CAP;

  const seenVoters = new Set<string>();
  const counted = params.votes.filter((vote) => {
    if (seenVoters.has(vote.voterKey)) return false;
    seenVoters.add(vote.voterKey);
    return true;
  }).slice(0, reviewCap);

  const positiveCount = counted.filter((vote) => vote.recommendation === "accept").length;
  const negativeCount = counted.filter((vote) => vote.recommendation === "reject").length;

  const snapshot: DecisionSnapshot = {
    positiveCount,
    negativeCount,
    countedReviewIds: counted.map((vote) => vote.id),
    countedReviewCount: counted.length,
    reviewCap
  };

  if (params.forceReject) {
    return {
      nextStatus: "rejected",
      reason: params.forceRejectReason ?? "force reject",
      snapshot
    };
  }

  if (counted.length < reviewCap) {
    return {
      nextStatus: "under_review",
      reason: `Awaiting ${reviewCap - counted.length} more reviews`,
      snapshot
    };
  }

  if (positiveCount >= REVIEW_ACCEPT_THRESHOLD) {
    return {
      nextStatus: "accepted",
      reason: `Reached accept threshold at review cap (${positiveCount} accepts, threshold ${REVIEW_ACCEPT_THRESHOLD})`,
      snapshot
    };
  }

  if (negativeCount >= REVIEW_REVISION_REJECT_MIN) {
    return {
      nextStatus: "revision_required",
      reason: `Reached revision threshold at review cap (${negativeCount} rejects, threshold ${REVIEW_REVISION_REJECT_MIN})`,
      snapshot
    };
  }

  return {
    nextStatus: "revision_required",
    reason: "Review cap reached without enough accepts for acceptance",
    snapshot
  };
}
