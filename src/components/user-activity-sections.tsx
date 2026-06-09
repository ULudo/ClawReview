import type { Route } from "next";
import { PaginatedRowList, type PaginatedRow } from "@/components/paginated-row-list";
import { SectionCard } from "@/components/section-card";
import { formatIsoMinuteUtc } from "@/lib/date-format";
import type { PublicCommunityPostListItem, PublicHumanIdentity, PublicPaperListItem, PublicReviewComment, PublicUserSummary } from "@/lib/types";

const DEFAULT_ACTIVITY_LIMIT = 8;

type ReviewItem = PublicReviewComment & {
  paperTitle: string;
};

export function UserActivitySections({
  human,
  summary,
  posts,
  papers,
  reviews,
  outstandingReviewCount,
  reviewRequirementSatisfied,
  compactEmpty = false,
  headingLevel = 2,
  showSummary = true,
  itemLimit = DEFAULT_ACTIVITY_LIMIT
}: {
  human: PublicHumanIdentity;
  summary: PublicUserSummary;
  posts: PublicCommunityPostListItem[];
  papers: PublicPaperListItem[];
  reviews: ReviewItem[];
  outstandingReviewCount: number;
  reviewRequirementSatisfied: boolean;
  compactEmpty?: boolean;
  headingLevel?: 1 | 2 | 3 | 4;
  showSummary?: boolean;
  itemLimit?: number;
}) {
  const submittedReviewsTone = reviewRequirementSatisfied ? "text-emerald-700" : "text-rose-700";
  const submittedReviewsSuffix = outstandingReviewCount > 0 ? ` (${outstandingReviewCount} missing)` : "";

  return (
    <>
      {showSummary ? (
        <SectionCard title={human.username} headingLevel={headingLevel}>
          <UserSummaryStats
            summary={summary}
            submittedReviewsTone={submittedReviewsTone}
            submittedReviewsSuffix={submittedReviewsSuffix}
          />
        </SectionCard>
      ) : null}

      {posts.length || !compactEmpty ? (
        <ActivitySection
          title="Posts"
          empty="No posts yet."
          itemLimit={itemLimit}
          rows={posts.map(({ post }) => ({
            id: post.id,
            href: `/posts/${post.id}` as Route,
            title: post.title,
            detail: post.tags.length ? `Tags: ${post.tags.join(", ")}` : "Post",
            meta: `Updated ${formatIsoMinuteUtc(post.updatedAt)}`,
            ariaLabel: `Open post ${post.title}`
          }))}
        />
      ) : null}

      {papers.length || !compactEmpty ? (
        <ActivitySection
          title="Published Papers"
          empty="No published papers yet."
          itemLimit={itemLimit}
          rows={papers.map(({ paper }) => ({
            id: paper.id,
            href: `/papers/${paper.id}` as Route,
            title: paper.title,
            detail: `Status: ${paper.latestStatus.replace("_", " ")}`,
            meta: `Updated ${formatIsoMinuteUtc(paper.updatedAt)}`,
            ariaLabel: `Open paper ${paper.title}`
          }))}
        />
      ) : null}

      {reviews.length || !compactEmpty ? (
        <ActivitySection
          title="Submitted Reviews"
          empty="No reviews submitted yet."
          itemLimit={itemLimit}
          rows={reviews.map((review) => ({
            id: review.id,
            href: `/papers/${review.paperId}` as Route,
            title: review.paperTitle,
            detail: `Recommendation: ${review.recommendation}`,
            meta: `Submitted ${formatIsoMinuteUtc(review.createdAt)}`,
            ariaLabel: `Open reviewed paper ${review.paperTitle}`
          }))}
        />
      ) : null}
    </>
  );
}

export function UserSummaryStats({
  summary,
  submittedReviewsTone,
  submittedReviewsSuffix
}: {
  summary: PublicUserSummary;
  submittedReviewsTone?: string;
  submittedReviewsSuffix?: string;
}) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-4">
      <div>
        <dt className="font-medium">Published Papers</dt>
        <dd className="text-steel">{summary.paperCount}</dd>
      </div>
      <div>
        <dt className="font-medium">Submitted Reviews</dt>
        <dd className={submittedReviewsTone ?? "text-steel"}>
          {summary.reviewCount}{submittedReviewsSuffix ?? ""}
        </dd>
      </div>
      <div>
        <dt className="font-medium">Accepted</dt>
        <dd className="text-steel">{summary.acceptedCount}</dd>
      </div>
      <div>
        <dt className="font-medium">Revision Required</dt>
        <dd className="text-steel">{summary.revisionRequiredCount}</dd>
      </div>
    </dl>
  );
}

function ActivitySection({
  title,
  empty,
  rows,
  itemLimit
}: {
  title: string;
  empty: string;
  rows: PaginatedRow[];
  itemLimit: number;
}) {
  return (
    <SectionCard title={title}>
      <PaginatedRowList rows={rows} empty={empty} pageSize={itemLimit} />
    </SectionCard>
  );
}
