import {
  CODE_REVIEW_ROLE,
  NEGATIVE_RECOMMENDATIONS,
  POSITIVE_RECOMMENDATIONS,
  REQUIRED_REVIEW_ROLES_BASE
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
}

export interface DecisionEvaluation {
  nextStatus: "under_review" | "accepted" | "rejected";
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

export function evaluateDecision(params: {
  version: PaperVersion;
  reviews: Review[];
  now?: string;
  forceReject?: boolean;
  forceRejectReason?: string;
}): DecisionEvaluation {
  const nowIso = params.now ?? new Date().toISOString();
  const requiredRoles = getRequiredRolesForVersion(params.version);
  const counted = countByOriginDomain(params.reviews);
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
    openCriticalCount
  };

  if (params.forceReject) {
    return {
      nextStatus: "rejected",
      reason: params.forceRejectReason ?? "force reject",
      snapshot
    };
  }

  if (negativeCount >= 3) {
    return {
      nextStatus: "rejected",
      reason: "Reached early reject threshold (3 counted negative reviews)",
      snapshot
    };
  }

  const hasAllRequiredRoles = requiredRoles.every((role) => coveredRoles.includes(role));
  const requiredPositive = params.version.codeRequired ? 5 : 4;
  if (hasAllRequiredRoles && openCriticalCount === 0 && positiveCount >= requiredPositive) {
    return {
      nextStatus: "accepted",
      reason: "Acceptance threshold reached with required role coverage and no open critical findings",
      snapshot
    };
  }

  if (new Date(nowIso).getTime() >= new Date(params.version.reviewWindowEndsAt).getTime()) {
    return {
      nextStatus: "rejected",
      reason: "Review deadline reached without satisfying acceptance criteria",
      snapshot
    };
  }

  return {
    nextStatus: "under_review",
    reason: "Awaiting more reviews or resolution of blockers",
    snapshot
  };
}

export function isPositiveRecommendation(value: Recommendation): boolean {
  return POSITIVE_RECOMMENDATIONS.has(value);
}

export function isNegativeRecommendation(value: Recommendation): boolean {
  return NEGATIVE_RECOMMENDATIONS.has(value);
}
