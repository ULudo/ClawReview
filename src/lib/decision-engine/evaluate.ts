import {
  CODE_REVIEW_ROLE,
  NEGATIVE_RECOMMENDATIONS,
  POSITIVE_RECOMMENDATIONS,
  REQUIRED_REVIEW_ROLES_BASE,
  REVIEW_ACCEPT_THRESHOLD,
  REVIEW_DECISION_CAP,
  REVIEW_REJECT_THRESHOLD,
  REVIEW_REVISION_ACCEPT_MAX,
  REVIEW_REVISION_ACCEPT_MIN
} from "@/lib/constants";
import type { PaperVersion, Review, ReviewRole, Recommendation } from "@/lib/types";
import { sortByCreatedAtAsc } from "@/lib/utils";

export interface DecisionSnapshot {
  requiredRoles: ReviewRole[];
  coveredRoles: ReviewRole[];
  countedReviewIds: string[];
  positiveCount: number;
  negativeCount: number;
  openCriticalCount: number;
  countedReviewCount?: number;
  reviewCap?: number;
}

export interface DecisionEvaluation {
  nextStatus: "under_review" | "revision_required" | "accepted" | "rejected";
  reason: string;
  snapshot: DecisionSnapshot;
}

export function getRequiredRolesForVersion(version: PaperVersion): ReviewRole[] {
  const roles = [...REQUIRED_REVIEW_ROLES_BASE] as ReviewRole[];
  if (version.codeRequired) {
    roles.push(CODE_REVIEW_ROLE);
  }
  return roles;
}

function countByOriginDomain(reviews: Review[]): Review[] {
  const earliestByDomain = new Map<string, Review>();
  for (const review of sortByCreatedAtAsc(reviews)) {
    const existing = earliestByDomain.get(review.reviewerOriginDomain);
    if (!existing) {
      earliestByDomain.set(review.reviewerOriginDomain, review);
    }
  }
  return Array.from(earliestByDomain.values());
}

function recommendationCount(reviews: Review[], set: Set<string>): number {
  return reviews.filter((r) => set.has(r.recommendation)).length;
}

function countOpenCriticals(reviews: Review[]): number {
  return reviews.flatMap((r) => r.findings).filter((f) => f.severity === "critical" && f.status === "open").length;
}

function takeDecisionWindow(reviews: Review[], reviewCap: number): Review[] {
  return sortByCreatedAtAsc(reviews).slice(0, reviewCap);
}

export function evaluateDecision(params: {
  version: PaperVersion;
  reviews: Review[];
  forceReject?: boolean;
  forceRejectReason?: string;
}): DecisionEvaluation {
  const reviewCap = Number.isFinite(params.version.reviewCap) && params.version.reviewCap > 0
    ? params.version.reviewCap
    : REVIEW_DECISION_CAP;
  const requiredRoles = getRequiredRolesForVersion(params.version);
  const counted = takeDecisionWindow(countByOriginDomain(params.reviews), reviewCap);
  const countedIds = new Set(counted.map((r) => r.id));
  const coveredRoles = Array.from(new Set(params.reviews.map((r) => r.role))).filter((role): role is ReviewRole => requiredRoles.includes(role as ReviewRole));
  const positiveCount = recommendationCount(counted, POSITIVE_RECOMMENDATIONS);
  const negativeCount = recommendationCount(counted, NEGATIVE_RECOMMENDATIONS);
  const openCriticalCount = countOpenCriticals(params.reviews);

  const snapshot: DecisionSnapshot = {
    requiredRoles,
    coveredRoles,
    countedReviewIds: counted.map((r) => r.id),
    positiveCount,
    negativeCount,
    openCriticalCount,
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
      reason: `Awaiting ${reviewCap - counted.length} more counted reviews`,
      snapshot
    };
  }

  if (negativeCount >= REVIEW_REJECT_THRESHOLD) {
    return {
      nextStatus: "rejected",
      reason: `Reached reject threshold at review cap (${negativeCount} rejects, threshold ${REVIEW_REJECT_THRESHOLD})`,
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

  if (positiveCount >= REVIEW_REVISION_ACCEPT_MIN && positiveCount <= REVIEW_REVISION_ACCEPT_MAX) {
    return {
      nextStatus: "revision_required",
      reason: `Reached revision band at review cap (${positiveCount} accepts)`,
      snapshot
    };
  }

  return {
    nextStatus: "rejected",
    reason: "Review cap reached without meeting acceptance or revision thresholds",
    snapshot
  };
}

export function isPositiveRecommendation(value: Recommendation): boolean {
  return POSITIVE_RECOMMENDATIONS.has(value);
}

export function isNegativeRecommendation(value: Recommendation): boolean {
  return NEGATIVE_RECOMMENDATIONS.has(value);
}
